# NoteFlow — "El Cerebro" (índice semántico, vista cerebro, LLM/chat, segundo cerebro)

### Índice semántico local — "El Cerebro" Fases 1-2 (`electron/ai/`, `src/components/Brain/`)
Subsistema de IA **100% local/offline** que indexa cada **sección** de cada nota como un
**embedding** (vector). El índice es un **artefacto derivado y reconstruible** desde los `.md` (si
se borra, se regenera). Plan maestro "El Cerebro": Fase 1 (índice + panel "Related notes", hecha)
→ **Fase 2 (vista cerebro/grafo, hecha)** → **Fase 3 (panel IA: chat RAG + segundo cerebro, hecha;
falta verificar en app real)** → **Fase 4 (nube/monetización — ver
`.agents/context/monetization.md`)**. **Principio: un índice, tres
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
  en la vista de contenido, sobre las tarjetas de la note overview y sobre los tabs del editor). Indicador `EyeOff` en la pestaña del
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
- **Notas vinculadas (archivo de texto externo —Markdown o texto plano—, ver `patterns.md` § "Notas vinculadas"):** no son carpetas del dir
  de notas, así que el worker las recibe **como datos** (`DataNote` en `protocol.ts`): `index-note-data`
  (vía `aiIndex.scheduleIndexData(key, read)`, mismo debounce/staleness/dormancia que `scheduleIndex`) y el
  campo `extra` de `reindex-all` (`aiIndex.init({ extraNotes })` → `linkedNotes.aiNotes()`). Clave en el
  índice (`file_path`) = `linked://<id>`; `removeFromIndex(key)` al desvincular. Una sola sección (`body`);
  respeta `aiHidden` (del registro local). Las reindexa `linkedNotes.ts` al escribir, al detectar un cambio
  externo y al cambiar el título-alias o `aiHidden`. Las de **texto plano** (`.json`, `.yaml`, código, logs)
  se indexan igual (por defecto, a propósito: un config o un script del proyecto es contexto útil); si meten
  ruido, "Hide from AI" las saca. Como cualquier vinculada, máx. 2 MB (más grande = `tooLarge`, sin contenido
  nuevo que indexar). Las **temporales** (abiertas desde el sistema con "Abrir con NoteFlow" y no mantenidas,
  `transient` en el registro) **no se indexan**: `aiNote` devuelve `null` y `aiNotes()` las omite, no se avisa
  de sus cambios y al descartarlas no se llama a `removeFromIndex` (nunca entraron); al pasar a permanentes
  ("Keep in NoteFlow" o al organizarlas) se indexan. Las tools del agente sí las ven.
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
  TitleBar → `notesStore.brainViewOpen`, espejo de `contentPlace`; sustituye el editor en `App.tsx`,
  `setActiveNote` lo cierra). **`BrainView` elige el render según WebGL** (`detectWebGL()`):
  - **`BrainScene.tsx` (3D, POR DEFECTO — Fase 2.5):** cerebro inmersivo con **three.js**
    (`WebGLRenderer` + `EffectComposer`/`UnrealBloomPass` + `OrbitControls`). Aspecto "Corriente
    afinada · Bandas" (aprobado en prototipo, 2026-11): **solo alambre y puntos** sobre la malla fija
    de `brainMesh.ts`, con cada nodo del grafo fijado a un vértice (`assignVertices.ts`). Detalle
    abajo en § "Malla y asignación" y § "Render 3D". Click en nota/sección → tarjeta de vista previa
    anclada (`onNodeActivate` → `BrainNodePreview`, que abre la nota desde ahí); click en grupo → su
    vista (`onOpenGroup`); click en carpeta → la selecciona (foco); hover de nota/sección → barrido de
    sus relaciones de contenido. Forzar 2D: `localStorage 'noteflow:brain-force-2d'`. En equipos de pocos recursos
    el cerebro arranca por defecto en 2D y muestra un popup una-vez ofreciendo cambiar a 3D; la
    elección explícita del usuario (o el legacy force-2D) se marca con `localStorage
    'noteflow:brain-3d-chosen'` y ya no vuelve a nudgear.
    El diálogo de la **IA local** (botón "Local AI" de la cabecera, siempre lo abre) se **auto-abre solo la
    primera vez** que se entra con la IA local apagada (onboarding una vez): al auto-abrirse se marca
    `localStorage 'noteflow:brain-local-ai-prompt-seen'` (`brainSettingsStore.markLocalAiPromptSeen`), cierre
    como cierre el usuario. El popup de gama baja espera a que ese diálogo no esté abierto.
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
  archivadas/cifradas/temporales. Dos campos del nodo son solo para el 3D: **`centered`** en el nodo
  del grupo del perfil de IA (nombre = `AI_GROUP_NAME` de `src/lib/aiGroup.ts`, comparado con
  `isAiGroupName`: trim + sin distinguir mayúsculas) y **`groupId`** (`g:<id>`) en carpetas, notas y
  secciones que cuelgan de un grupo (las notas sueltas no lo llevan). Test:
  `tests/components/useBrainGraph.test.ts`. Smoke headless: `scripts/ai-graph-smoke.cjs`.
  - **Malla y asignación (lógica pura, sin three):**
    - **`brainMesh.ts` — forma FIJA, sin parámetros.** Es un port exacto del prototipo aprobado
      (mismos vértices, aristas y caras, en el mismo orden): **4499 vértices · 11684 aristas · 5644
      caras** (2562 de superficie cerebral, 1665 interiores, 200 de cerebelo, 72 de tronco). El cerebro
      se **levanta a partir de perfiles medidos** (curvas `TOP`/`BOT`/`MED`/`WID`, `inside()` +
      `solveRadius()` sobre una icosfera de 4 subdivisiones); los **giros son geometría**: el campo
      `gyri()` separa giro/surco, los vértices se deslizan hasta la frontera y se desplazan
      radialmente. Cada arista lleva un peso `edgeW` (contorno de giro 1 · dentro de giro 0.3 · dentro
      de surco 0.045 · ×0.6 por debajo · **0 = costura oculta** entre cerebro/cerebelo/tronco: se
      enruta por ella pero no se dibuja) y cada vértice un `vertW`. `cortex` marca los 1315 vértices
      donde puede vivir una nota (sobre un giro, ni por debajo ni en la fisura); `kind` = 0 cerebro ·
      1 cerebelo · 2 tronco; `surface` = 0 en el entramado interior; `center` = núcleo `[0, 0.42, 0]`;
      `boundCenter`/`boundRadius` = esfera envolvente de la superficie cerebral. **No cambiar el orden
      de las operaciones en coma flotante ni el de inserción de vértices/aristas**: los tests fijan la
      huella del prototipo (`tests/helpers/brainMeshRef.ts`, `tests/components/brainMesh.test.ts`).
    - **Singleton de sesión:** `getBrainMesh()` construye una vez y la reutiliza en cada apertura del
      cerebro (medido: ≈65-70 ms la primera llamada en frío, ≈40 ms con el JIT caliente, tanto en
      Node 24 como con el V8 de Electron 35); ya no depende de cuántas notas hay (se fueron
      `adaptiveDetail`, `BrainShapeParams` y el panel de escultura). `buildBrainMesh()` es el
      constructor puro (tests/bench). El módulo no importa three.
    - **Rutas (A\* sobre el entramado):** `pathBetween` (longitud euclídea; estructura),
      `pathThroughInterior` (penaliza la capa exterior) y `routeContentEdges(pairs)` (lote con
      congestión: cada ruta encarece las aristas que usa, así las siguientes se abren en paralelo).
      El estado de búsqueda vive en arrays compartidos con sello de generación (una ruta no reserva
      nada); las cachés por par están acotadas y `routeContentEdges` recuerda el último lote (mismos
      pares en el mismo orden → mismas rutas sin recalcular). Los arrays de ruta devueltos son
      compartidos: no mutarlos. Coste real: **≈0,3 ms por arista de contenido** (el A\* con peso de
      interior + congestión explora ~la mitad del entramado), es decir ~0,5 s para ~1800 relaciones.
    - **Isla suelta:** la malla aprobada tiene **7 vértices interiores** (polo occipital) conectados
      solo entre sí; `pathBetween` hacia ellos devuelve `null` (los llamadores ya caen a la recta
      `[a, b]`). `assignVertices` nunca coloca nodos ahí.
    - **`assignVertices.ts` — "corteza primero":** los grupos se siembran por muestreo del punto más
      lejano sobre toda la corteza (el primero, frontal-lateral); cada carpeta coge un parche propio
      junto a su grupo; las notas se agrupan alrededor de su padre sin ocupar vértices adyacentes
      mientras haya sitio; las sueltas rellenan huecos (punto más lejano) y las sueltas favoritas van
      al cerebelo; el grupo `centered` (perfil de IA) va al vértice interior más cercano al núcleo y
      sus notas se quedan dentro; cada sección cuelga de un vecino libre de su nota. Mientras hay
      sitio en la corteza el resultado es idéntico al del prototipo; **si se llena** (más nodos que
      los 1315 vértices de corteza: el prototipo los descartaba) los nodos se desbordan al resto del
      cerebro en vez de desaparecer, y el primer grupo nunca cae sobre un vértice ya ocupado.
      **Compacidad (desviación deliberada del prototipo, que dispersaba los grupos grandes):** el
      hueco de una nota se busca recorriendo solo la **superficie** del cerebro (sin atajar por el
      entramado interior), el hueco "espaciado" vale dentro de `min(AIR_REACH = 0.45, territorio)`
      —territorio = mitad de la distancia al grupo más cercano— y, agotado, la nota toma el giro libre
      más cercano aunque toque a una hermana; sin giros libres en el territorio, el hueco de
      superficie más cercano (surco/fisura/cara inferior). Con ≤ ~10 notas por ancla (lo que se vio
      en el prototipo) el resultado sigue siendo idéntico al suyo. Medido: 40 notas por grupo → máx.
      0,41 de su padre (antes 1,97; el cerebro mide 2,3). Tests: `tests/components/assignVertices.test.ts`.
  - **Render 3D (`BrainScene.tsx` + `brainLook.ts`, `brainShaders.ts`, `brainData.ts`, `brainBuffers.ts`):**
    - **Módulos:** `brainLook.ts` = TODOS los números del aspecto (`BRAIN_LOOK`) + presupuestos
      (`BRAIN_BUDGET`); no hay presets ni sliders. `brainShaders.ts` = GLSL (líneas, puntos, nodos,
      grade). `brainData.ts` (puro, sin three, testeado) = datos derivados del grafo: nodos colocados,
      rutas de estructura con arco acumulado y `count` (troncos), dendritas, segmentos de sinapsis sin
      duplicar, `edgePaths`, `fibre()` (Catmull-Rom centrípeto), `focusMask`, `outwardFaces`.
      `brainBuffers.ts` (puro, testeado) = empaquetado por segmento (44 B; 36 B sin arco).
    - **Canal de color = el del prototipo (three r128 sin gestión de color), a propósito:** los
      triples sRGB del tema entran tal cual (`setRGB` sin espacio de color), `outputColorSpace =
      LinearSRGBColorSpace`, composer con destino de **8 bits** (`UnsignedByteType`). Así los valores
      de `BRAIN_LOOK` son los aprobados 1:1 (calibrado con capturas lado a lado: luminancia media
      30,9 vs 31,0, p99 120,3 vs 120,5). **No reintroducir `SRGBColorSpace` ni el destino half-float
      por defecto**: cambian el aspecto y el bloom.
    - **Oclusión real:** las caras de la malla se dibujan primero como **piel invisible** que solo
      escribe profundidad (`outwardFaces`: cerebelo y tronco vienen enrollados hacia dentro y se
      voltean; el tronco, tubo abierto, va en ambos sentidos). Alambre, puntos, rutas y nodos se
      dibujan dos veces desde la misma geometría: visible (`LessEqualDepth`) y **oculto**
      (`GreaterDepth`, mucho más tenue: cara trasera + relleno interior). Sinapsis, impulsos, halos
      y barridos ignoran la profundidad.
    - **Capas (orden fijo, tabla `ORDER`; three no desempata por orden de creación):** constelación
      lejana + motas (fondo), suelo (solo oscuro), alambre ±oculto (quads instanciados con grosor y
      suavizado; peso `edgeW`), puntos ±ocultos (`vertW`), sinapsis en reposo (contenido +
      relaciones de usuario en una malla; `uShowContent` apaga las de contenido), chispas
      ambientales, rutas + dendritas ±ocultas (una llamada por pase; troncos más gruesos cerca del
      grupo), impulsos, halo de nodos, barridos de hover/pensando, nodos ±ocultos y marcador del nodo
      enfocado. Post: `RenderPass` → `UnrealBloomPass` (solo temas
      oscuros) → `GRADE` (viñeta + grano; además **suma ahí el bloom** —el dibujo de mezcla del pase
      se oculta con `blendMaterial.visible = false`— y la **luz interior**, que ya no es un sprite).
      Temas claros: sin bloom, sin luz interior ni suelo, mezcla normal.
    - **Movimiento (todo por uniforms; el bucle solo escribe las 6 chispas):** entrada desde el
      núcleo (una vez por montaje), impulsos por las ramas y en las sinapsis, 4 ranuras de onda
      (`uWaves`: foco, ambientales, **latido cada 6,5 s**, "pensando", cascada desde las notas
      citadas), foco que atenúa lo no relacionado, barridos de hover/`thinking` como fibras suaves.
    - **Cámara:** tres cuartos lateral, posición `(3.16, 1.01, 1.03)`, objetivo `(0, 0.3, 0)`
      (órbita y zoom sobre el centro del cerebro); `fitCamera` aleja en ventanas estrechas.
      **Etiquetas** HTML atenuadas por profundidad y sin solaparse; niveles por zoom (grupos siempre,
      carpetas < 2,8, notas < 2,2, secciones solo enfocadas). Contrato con `scripts/lib/capture-kit.cjs`
      (`probeBrainNode`): la etiqueta enfocada lleva en línea `opacity: 1` + `font-weight: 400` y el
      canvas `cursor: pointer`.
    - **Adaptaciones fuera del prototipo** (casos que su grafo de ejemplo no tenía): impulsos solo
      en las 160 relaciones más fuertes y fibras ×3 (el prototipo: todas, ×6); en **tema claro** las
      sinapsis en reposo bajan de opacidad con la densidad (`syn.lightRef`/`lightMin`) y las
      rutas/dendritas neutras (`--text`) usan un gris (`color.lightNeutral`) en vez de negro.
    - **Rendimiento (requisito: no consumir más que el cerebro anterior).** Sin MSAA
      (`antialias: false`), destino de 8 bits, cero asignaciones por fotograma, picking como mucho una
      vez por fotograma, etiquetas que solo tocan el DOM si cambian, malla cacheada, `rebuildData`
      solo si cambia el modelo. **Pausa:** el bucle se detiene con la ventana minimizada u oculta en
      la bandeja mediante el evento IPC **`window:visibility`** (`onWindowVisibility` del preload) —
      `document.hidden` NO sirve porque la ventana principal tiene `backgroundThrottling: false`—.
      Con **`prefers-reduced-motion`**: sin auto-rotación, impulsos, ondas (ni ambientales, ni de
      "pensando", ni la cascada de citadas), latido, chispas ni entrada; las notas citadas llevan una
      señal estática; y **render bajo demanda** (0 fotogramas en reposo, también con notas citadas).
      Marcas `performance.measure`: `brain:mesh`, `brain:data`, `brain:scene`.
    - **Sin aceleración por GPU (WebGL por software, SwiftShader/llvmpipe) este render es ~4× más
      lento que el anterior** (medido a 1028×866: ≈280 ms por fotograma frente a 66): el coste son los
      quads instanciados de las líneas (alambre visible + oculto ≈140 ms, impulsos ≈55, sinapsis ≈25),
      que un rasterizador por software paga por segmento. `detectWebGL()` no distingue ese caso y la
      heurística de gama baja es por CPU/RAM, no por GPU.
    - **Depuración/medida:** `localStorage['noteflow:brain-debug'] = '1'` expone `window.__nfBrain`
      (cámara, controles, renderer, composer, uniforms, `data()`, `setTime`, `setHover`, `setRotate`,
      `fireWave`, `replay`, `info()`); sin la clave no se expone ni se ejecuta nada.
    - **Espejo web (`docs/`, ya con este cerebro):** la lógica pura (malla, asignación,
      `brainData`, `brainBuffers`, `brainLook`, `brainShaders`) se **genera** desde estos módulos con
      `npm run brain` en `docs/` (copia + bundle; si quedó desfasada lo detectan `npm test` —
      `tests/components/brainWebSync.test.ts`— y `npm run brain:check`, que corre en `pages.yml`) y la
      escena es un **port a mano** de `BrainScene.tsx` a three r128 (`docs/public/brain/nf-brain.js`).
      Al cambiar estos módulos: `npm run brain`; al cambiar `BrainScene.tsx`: portarlo a mano. Detalle
      en `web.md` § "Fondo cerebro tech". La web sí distingue el WebGL sin GPU (pinta un fotograma
      fijo). El clip `brain-orbit` ya no está en el mosaico de la landing (se sacó y se borraron sus
      ficheros), así que no hay que regrabarlo.
- **Activación:** flag `settings.ai.enabled` (default `false`). **UI principal de activación: el
  overlay/CTA dentro de la vista cerebro** (con IA off el cerebro muestra solo estructura; activar
  desde ahí descarga el modelo + reindexa con barra de progreso). También hay toggle + "Reindex"
  en **Settings → AI**, sección "Your notes and AI" (`Settings/AiPanel.tsx`, bajo el proveedor LLM). Arranque del worker diferido ~4s tras el boot
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
  detalle en `.agents/context/monetization.md` § 3). `presetOf()` con id desconocido cae en
  `anthropic`, no en `PRESETS[0]`. **Modelo efectivo** (`effectiveModel`, `llm/index.ts`): el
  guardado o, si no hay, `suggestedModels[0]`; en los presets con **catálogo curado** (los que
  llevan `modelMeta` — hoy solo `noteflow`, cuya lista rota y cuyo proxy rechaza lo que no esté en
  ella) un modelo guardado que ya no esté en `suggestedModels` **también** cae en el primero, para
  que un catálogo renovado no deje al usuario con un modelo inválido. Ese fallback es **solo en
  memoria**: `settings.aiLlm` conserva el id guardado, así que si un catálogo posterior lo vuelve a
  traer, vuelve a ser el efectivo. En los presets BYO el modelo es libre y se respeta tal cual.
- **Catálogo de modelos de NoteFlow AI (servido por el proxy, `electron/ai/llm/managedCatalog.ts`):**
  la fuente de verdad es la tabla Supabase `public.ai_models` (migraciones 0012 + 0013), que el proxy
  sirve en `GET <ai-proxy>/models` en formato lista OpenAI **con metadatos por entrada** (`cost_index`,
  `images`, `recommended` — `GET /models` nunca expone los precios). `cost_index` = cuántas veces
  más rápido que el modelo recomendado gasta un mensaje típico la asignación mensual (entero ≥ 1; lo
  calcula el proxy — ver `.agents/context/monetization.md` § 3 "Cuota por coste real"). Main lo descarga (`llm.fetchManagedCatalog`, con el access token de la cuenta) en
  segundo plano cada vez que la cuenta cambia de estado con el plan usable (`handleAccountStatusChanged`
  con `isManagedAiUsable`: cubre el arranque —el refresh de entitlements diferido de `initAccount`
  emite un cambio de estado—, el inicio de sesión y la llegada de entitlements) y en cada lectura de
  `ai:llm-presets` (al abrir el asistente o Ajustes → IA), con **throttle de 10 min tras un éxito** y
  single-flight; y **forzado** por `ai:llm-list-models` con `noteflow` (la UI ya no ofrece "Load" en el catálogo curado) y
  cuando el chat recibe un 400 `model_not_allowed` del proxy (`friendlyChatError`: el modelo se
  retiró en el servidor pero seguía en la caché — así solo falla ese mensaje). Un 401 al descargar
  invalida el access token (`invalidateAccessToken`), como el resto de llamadas a la cuenta. Lo valida (`sanitizeManagedCatalog`: **todo o nada** — un id vacío, un
  `cost_index` no numérico/≤0, un `images` no booleano, un `recommended` presente y no booleano, una
  lista vacía o >200 entradas, o un proxy muy antiguo que solo manda ids → se ignora la respuesta
  entera). Un proxy **pre-0013** (manda `quota_multiplier` en vez de `cost_index`) **sí** se adopta,
  con el multiplicador como pista de coste: así un cliente nuevo frente a un proxy sin redesplegar usa
  los modelos que ese proxy permite en vez de su respaldo (que tiene ids que el viejo rechazaría). Si
  cambió, lo persiste en
  `settings.aiManagedCatalog` (local, `userData`) y emite `ai:llm-presets-changed` (el renderer
  recarga presets + config desde `App.tsx`). Forma en `settings.json`: `{models: [{id, costIndex,
  images, recommended}], updatedAt}`; una caché escrita por una versión anterior (forma
  `quotaMultiplier`) **se ignora** sin romper (`parseStoredManagedCatalog` → null): rige el respaldo
  hasta el primer refresco, que la reescribe. **Catálogo efectivo** = el cacheado si existe, si no las
  constantes de respaldo `NOTEFLOW_AI_MODELS` + `NOTEFLOW_AI_MODEL_META` de `presets.ts`. Main lo
  siembra desde `settings.json` al arrancar (`loadManagedCatalogCache`, antes de `initAccount`).
  `llm/index.ts` lo inyecta en el preset (`livePreset` = `withManagedCatalog(presetOf(id))`), así que
  `effectiveModel`, `acceptsModel`, `providerCapabilities` (vía `toPublic`) y `ai:llm-presets`
  (`listPresets`) usan **el mismo** catálogo: un modelo nuevo aparece en el picker con su etiqueta
  (`LlmConfigView` → `ModelPicker`: nombre sin prefijo de proveedor + chip "Recommended" si
  `recommended` + chip "≈N× quota" si `costIndex >= 2`) sin release. Invariantes: refrescar **nunca** toca el modelo
  guardado (`aiLlm`), y un fallo de red / respuesta inválida **nunca** vacía ni pisa la caché buena.
  Qué pasa si el modelo guardado sale del catálogo: lo de arriba (fallback **en memoria** al primero
  del catálogo, que es el recomendado). El `replaced_by` de `ai_models` (0013) **no** llega al cliente:
  lo aplica el **proxy**, que reescribe al sucesor las peticiones a un id retirado (lo que mantiene
  funcionando los builds internos/QA de `main` anteriores al catálogo en BD —b74fad0—, con el
  catálogo hardcodeado; ninguna release pública los lleva); este cliente ni siquiera las envía,
  porque su `effectiveModel` ya cae al primero. Tests: `tests/electron/managedCatalog.test.ts`.
- **UI del proveedor (`LlmConfigView`, embebida en Settings → IA y en la pestaña "settings" del panel
  del cerebro; rediseño "lista con formulario", 2026-11):** sección **"Assistant"**
  (`SettingsListSection` de `Settings/ui.tsx`, con resumen a la derecha del título: "Answers with
  <modelo>" solo si `llmConfig.configured` — el proveedor activo puede responder: clave guardada si la
  necesita, modelo, y para `noteflow` sesión + entitlement —; si no, "Not set up"). Debajo, **un solo
  bloque con borde y tres filas con radio** (`role="radiogroup"`): **NoteFlow AI** (etiqueta de precio
  `useOfferTag`: "€5.99/month", "In your plan" o "Add to your plan"), **Your API key** (presets con
  `needsKey`; "Free") y **Local model** (presets sin clave: Ollama, Custom; "Free"). Dos estados
  **independientes**: la fila **elegida** (`view`, estado de vista) se despliega dentro de sí misma con
  un **formulario etiqueta + control** (`FormRow`: rejilla `112px | control` en Ajustes; en el panel
  estrecho del cerebro —sin `embedded`— la etiqueta va encima del control), y la fuente **en uso**
  (`llmConfig.active`, solo si `configured`) lleva la pastilla verde **"In use · <proveedor>"**
  (`StatusBadge tone="ok"`; en el panel estrecho, bajo la descripción). Una instalación nueva queda
  en Anthropic **sin clave** → "Not set up" y ninguna pastilla.
  - **Formularios:** NoteFlow AI con plan (o sin verificar → fila "Plan" con `PlanUnknownNotice`):
    **Quota** (barra + "N% of this month's AI allowance used", `usagePercent`: `used/limit` con suelo,
    100 % solo al agotarla; `GET /usage` devuelve unidades abstractas), **Model**, **Connection**.
    NoteFlow AI **sin el plan** (sin sesión, sin entitlement, o con solo Cloud): fila **Plan** con el
    precio + "View plan", que sustituye la lista por el **detalle del plan** (`PlanDetail product="ai"`,
    enlace "← AI options"; ver `monetization.md` § "Bloque de planes"); `initialOffer` (Ajustes →
    Cuenta → "View") abre ese detalle directamente. Your API key: **Provider** (`<select>` con los
    presets de clave + pista Anthropic/OpenAI-compatible), **API key** (guardada: `••••••••` ✓ "Saved"
    + "Change"/"Remove"; sin guardar: input + "Save"), **URL** (solo presets con `editableBaseUrl`),
    **Model**, **Connection**. Local model: **Server** (Ollama/Custom), **URL**, **Model**,
    **Connection**. NoteFlow AI **no aparece en ningún `<select>`**.
  - **Los campos se ven siempre, también antes de activar la fuente.** Cada edición va al **propio**
    preset mostrado con el parámetro `preset` de `ai:llm-set-config` (`aiChatStore.setLlmConfig({…,
    preset})`): main edita `byPreset[preset]` (`llm.withPresetFields`, con los guards
    `acceptsModel`/`acceptsBaseUrl` de **ese** id) y **nunca** cambia `active`, `lastByoProvider` ni la
    restauración pendiente. Las vistas de los presets no activos se leen con
    `ai:llm-get-config(preset)` (`llm.toPublicFor`; su `active` es el id del preset y no llevan
    `lastByoProvider`) y se guardan en estado local (`presetViews`); el store solo re-lee `llmConfig`
    (de main) si el preset editado es el activo. "Load list"/"Detect" y "Test" pasan también el
    `preset` (`ai:llm-list-models(preset)` / `ai:llm-test(preset)`: config resuelta en una copia en
    memoria, `llm.asActivePreset`). Mientras el proveedor elegido no sea el activo, un **pie con borde
    discontinuo** dice "The chat now uses X." (o "The chat doesn't have a model yet.") con el botón
    primario **"Use <proveedor>"** (`setLlmConfig({ active })`, el único camino que cambia de proveedor;
    con NoteFlow AI sin plan no se ofrece). Cambiar el `<select>` ya **no** activa el proveedor.
  - **Model** (`ModelPicker`): desplegable propio; cada fila con radio, nombre sin prefijo de proveedor
    (`modelDisplayName`), chip de acento "Recommended" y chip "≈N× quota" amarillo desde ≈2× y rojo
    desde ≈10× (`quotaChipTone`, `src/lib/llmSources.ts`). Opciones: `modelOptions` — en un preset de
    **catálogo curado** (`preset.modelMeta`, hoy solo `noteflow`) exactamente el catálogo, sin texto
    libre ni botón de carga (main lo refresca solo: lectura de presets con throttle y el 400
    `model_not_allowed` del chat); en el resto, sugeridos + listados + el guardado, con "Type another
    model…" (texto libre) y "Load list" (con clave) / "Detect" (local). Main aplica la misma regla del
    catálogo como defensa en profundidad: `ai:llm-set-config` descarta un `model` que
    `llm.acceptsModel()` rechace.
  - **Connection:** botón "Test" + resultado en línea ("✓ Responds" o el error).
  - `view` (`'noteflow' | 'key' | 'local'`) es **estado de vista**, no el proveedor activo: se resuelve
    **una vez** (`initialSource`) cuando la config está disponible (lazy init desde
    `useAiChatStore.getState()`, o una suscripción al store si aún no ha cargado) y **no se mueve solo**
    — que main active NoteFlow AI tras suscribirse no debe sacar al usuario de la fila en la que está
    (como `view` en `SyncPanel`). Activo `noteflow`, `initialOffer` o **nada configurado** → NoteFlow
    AI; si no, la fila del preset activo (`needsKey` → `'key'`, si no → `'local'`). Cada fila BYO
    apunta a un preset (`byoIds`, `byoPresetFor`): el activo si pertenece a la fila, si no
    `lastByoProvider` si pertenece, y si no el de la fila (**Anthropic** / **Ollama**). Helpers puros en
    `src/lib/llmSources.ts` (tests: `tests/lib/llmSources.test.ts`; los de main en
    `tests/electron/llmPresetEdit.test.ts`).
  - Debajo, en Ajustes → IA, la sección **"Your notes and AI"** (`Settings/AiPanel.tsx`, mismo
    formulario de etiquetas): **Local AI** (toggle; activa: "N notes" —notas sin cifrar del store— o el
    progreso/descarga del modelo, y "Reindex"), **Profile** ("Redo questionnaire" → abre el cerebro en
    la pestaña Profile y cierra Ajustes) y **CLI skill** (toggle; en la build de la Store, el texto
    explicativo sin toggle). Antes vivían en Ajustes → General.
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
  senderId** → la propia ventana del chat también refresca). Las ediciones de una nota **existente**
  (`writeNoteRecord`) avisan además a `ctx.onNoteEdited(noteId)`, con el que main las apunta en el
  log de actividad por dispositivo (`userData/activity-log.json`, ver `architecture.md`). Estas
  escrituras sí bumpean el `updated` de la nota (`serializeNoteFolder` sin `preserveUpdated`), pero
  la sección Activity de Ajustes → General (`lib/activitySummary.ts`) solo ve por `updated` el
  **último** día de edición de cada nota; los días anteriores salen del log. Tools v1: `list_notes`, `get_note`,
  `list_groups`, `search_notes`, `create_note`, `update_note`, `add_section`, `update_section`,
  `rename_section`, `create_group`, `create_folder`, `rename_group`, `rename_folder`, `delete_*`.
  Las **notas cifradas** se listan pero no se leen/editan. Las **notas vinculadas** (archivo externo, id
  `lnk:`; las de texto plano salen marcadas "plain-text file, NOT Markdown" en `list_notes`/`get_note` y sin
  etiquetas) entran por `ctx.linked` (`LinkedToolApi`, cableado en `main.ts` a `linkedNotes.ts`): se listan,
  leen y buscan como las demás; `update_section` escribe en el archivo (con la misma comprobación de huella:
  si cambió fuera, la tool falla sin escribir); `update_note` toca solo metadatos locales; `add_section` /
  `rename_section` / `delete_section` fallan (una sola sección); `delete_note` solo **desvincula** (el archivo
  nunca se borra; el confirm lo dice). Sin "deshacer" del chat para ellas (no hay snapshot de carpeta). El
  contexto del chat (`readAnyNote` en `main.ts`) también las lee. El **bucle** en `ai:chat` itera
  `streamTurn`→ejecutar tools→realimentar `role:'tool'` hasta que no haya `toolCalls` (máx. 12 pasos,
  `MAX_AGENT_STEPS`). **`reasoning_details`:** con razonamiento + tools, OpenRouter recomienda (y
  DeepSeek / Anthropic con thinking **exigen**) reenviar el razonamiento del turno del asistente que
  pidió las tools. `openaiCompatible.streamTurn` acumula `delta.reasoning_details` del SSE
  (`accumulateReasoningDetails`: por `index`, concatenando `text`/`summary`/`data`, el resto de campos
  —`signature`, `id`, `format`…— último valor) y lo devuelve en `AgentTurnResult.reasoningDetails`
  **solo si llegó alguno**; el bucle lo cuelga del mensaje `assistant` con `toolCalls` que realimenta
  en ese mismo turno, y `toOpenAiMessages` lo serializa como `reasoning_details` **solo** ahí (una API
  OpenAI-compatible estricta no debe ver el campo nunca). No se guarda en el historial: los turnos
  previos del usuario van sin él. Aplica a **cualquier** proveedor OpenAI-compatible que lo mande: el
  plan gestionado (el proxy inyecta el `reasoning_effort` del catálogo) y también un BYO como
  OpenRouter con un modelo de razonamiento, que streamea `reasoning_details` por su cuenta y recibe
  el mismo passthrough; Anthropic (SDK propio) no usa este campo. Test:
  `tests/electron/openaiReasoningDetails.test.ts`. **Tools siempre activas** (el modelo decide); **solo las destructivas piden
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
  (cambia el modelo del preset activo; con NoteFlow AI, si el elegido tiene `costIndex >= 2`, un badge
  rojo "xN" a su izquierda con tooltip — `ChatView`, mismo umbral que el chip "≈N× quota" de `quotaChipTone`). Textos del panel vía i18n (`src/i18n/{en,es}/aiPanel.ts`).
  Los **listeners del stream** (`aiChatStore.initListeners`) los monta **`App` una vez por ventana**
  (no `AiPanel`): la misma conversación corre en el cerebro y en el sidebar del editor, y una
  respuesta sigue llegando aunque se cambie de vista. `AiPanel` solo recarga config + sesiones.
- **Enrutado del panel desde la paleta de comandos:** `aiChatStore` expone `panelTab`/`pendingPrompt`
  + `openAiPanel(tab, prompt?)` (tipo `PanelTab = 'chat'|'related'|'profile'|'settings'`). La
  `CommandPalette` abre la brain view (`setBrainView(true)`) y llama `openAiPanel` para que el
  `AiPanel` cambie de pestaña reactivamente (un `useEffect` consume `panelTab` y gana sobre el
  auto-routing de primera vez). **Auto-routing de primera vez (`AiPanel`):** solo enruta a
  `settings` cuando **no hay proveedor configurado** (onboarding); con proveedor el panel aterriza
  **siempre en `chat`**. La pestaña `profile` **nunca se abre sola** — se llega pulsándola, desde la
  paleta o desde Settings → AI ("Redo questionnaire"). El comando inline **"Ask AI"** pasa un `prompt`: `openAiPanel`
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
  preset; para `noteflow` es el `images` del **catálogo efectivo** (columna `images` de
  `ai_models`; ver "Catálogo de modelos de NoteFlow AI" arriba). En el catálogo actual (0013 = respaldo)
  **los cinco modelos aceptan imágenes**, incluido el por defecto (`suggestedModels[0]`,
  `deepseek/deepseek-v4.1-flash-1017`); con el anterior (0012) el por defecto era text-only. No dar por
  hecho que siempre será así: una fila con `images = false` vuelve a desactivar el adjunto de imágenes
  para ese modelo. `.txt/.md` se
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
  diseño en `.agents/context/monetization.md`).

### Chat en el editor (sidebar flotante + ventana despegada)
El mismo chat del cerebro, accesible desde el editor. Piezas: `AiPanel/AiChatButton.tsx` (botón),
`AiPanel/AiChatSidebar.tsx` (panel), `AiPanel/ChatContextBar.tsx` + `lib/chatContext.ts` (contexto,
tests en `tests/lib/chatContext.test.ts`), `AiPanel/AiChatWindowApp.tsx` (ventana), `AiPanel/ChatMoreMenu.tsx`
(menú ⋯ de la ventana despegada; el sidebar ya no lo usa), `AiPanel/useChatEditorTarget.ts`; en main
`electron/ai/chatContext.ts` y `electron/ai/chatUndo.ts` (puros, tests en
`tests/electron/chatContext.test.ts` / `chatUndo.test.ts`).
- **Botón:** icono `BotMessageSquare` de 18 px con trazo fino (`strokeWidth` 1,25) en una **franja de
  44 px de ancho (`w-11`) y alto completo de la cabecera**, sin redondeo y pegada al borde derecho de
  `NoteEditor` (prop `aiChatButton`; `App` se lo pasa solo al panel único o al **más a la derecha** del
  split). Pulsado = gris discreto (`text-text bg-surface-3`, tokens de tema; no el acento). Ocupa **toda la
  banda entre la fila de pestañas y la toolbar de formato**: un wrapper `relative` envuelve la fila del
  título + la de fecha (reserva `pr-10`, que con el `px-4` de las filas deja 12 px libres a la izquierda
  del botón) y el botón es `absolute right-0 top-0 bottom-0`. En la vista bloqueada de una nota cifrada
  (sin fila de pestañas) la cabecera es `relative` con `pr-14` y el botón se posiciona igual (alto completo
  hasta el `border-b`). El componente fija solo el ancho; posición y alto los pone el call site
  (`className`). Abre/pliega el sidebar — es la **única** forma de plegarlo — y, con el chat despegado,
  enfoca la ventana (`ai:chat-window-focus`). Es también el **ancla** de posición (`aiChatAnchor.ts`,
  mismo patrón que `sidebarAnchor.ts`).
- **Sidebar:** `aside` absoluto en la fila de contenido de `App`, **hermano de `<main>`** (como el sidebar
  flotante de notas: sus drops no llegan al "soltar nota → split"), `z-30`, estilo TOC (`bg-surface-1`,
  borde, `rounded-xl`, sombra). Cuelga 6 px por debajo del botón (= del borde inferior de la cabecera,
  porque el botón la ocupa entera, así que nunca queda tapado) con el borde derecho a
  `max(EDGE, distancia al borde derecho del botón)` — con el botón pegado al borde, `EDGE` = 12 px;
  bottom 12 px. Re-mide con rAF en `ResizeObserver` de la fila, montaje/
  desmontaje del ancla, `resize` y un intervalo de 500 ms mientras está visible (la fila del título se
  mueve sin resize: banner de "sección borrada", scroll horizontal del split). Ancho 300–640 px
  arrastrando el borde izquierdo, persistido en `localStorage` (`noteflow-ai-chat-width`). **Animación**
  de plegar/desplegar: entra y sale deslizándose por el borde derecho (`transform: translateX`, 220 ms
  `ease`, los mismos valores que el dock/undock del sidebar de notas en `SidebarShell`; transform y no
  width para no re-maquetar la conversación en cada frame; `none` al estar dentro, por los `fixed`
  descendientes). `closing` lo mantiene montado durante la salida y `entered` cambia un frame pintado
  después de montar; ambos se resetean en render al cambiar `shown`, así que reabrir a mitad invierte el
  deslizamiento sin desmontar. Durante la salida la posición queda congelada (el bucle de medida solo
  corre con `shown` y mide el botón, que no se transforma). Como el sidebar de notas, no trata aparte
  `prefers-reduced-motion`. **Plegado en
  cada arranque** (`aiChatStore.sidebarOpen`, no se persiste). Solo se pinta en la vista de editor (no
  cerebro/overviews) y si el ancla está en pantalla; la conversación vive en el store, así que ocultarlo
  o cambiar de nota no la toca (mensajes, borrador, streaming).
- **Conversación compartida con el cerebro:** mismo `aiChatStore` (historial, hilo activo) y mismo
  `ChatView`, envuelto en `EditorChatView` (compartido con la ventana despegada: es la única fuente de
  lo que distingue al chat del editor del del cerebro) en variante `compact` con `renderHeader` (cabecera propia: sin texto de título — `sidebar.title` queda solo como aria-label y título de la ventana aparte —,
  selector de modelo y tres botones de icono a la vista — Historial (activo mientras el overlay está
  abierto, `historyOpen`), Nuevo chat y Abrir en ventana aparte), `contextBar`, `withContext` y
  `showSuggestions={false}`: el chat del editor (sidebar **y** ventana despegada) **no muestra los chips de
  sugerencias** (ni los starters del chat vacío ni los de seguimiento; el marcador del LLM se sigue
  quitando del texto con `splitSuggestions`). Solo el cerebro los muestra: por eso siguen vivos
  `buildStarterSuggestions`, `aiChatStore.suggestions` y su paso por el handoff (la conversación vuelve a
  la principal y el cerebro puede enseñar los de seguimiento). El cerebro sigue igual: sin
  barra de contexto ni `context` en el payload, y es el único que consume `pendingPrompt` ("Ask AI" de la
  paleta; `autoSendPendingPrompt`). Sin IA configurada: tarjeta con botón a **Ajustes → IA** (evento
  `noteflow:open-ai-settings`, lo atiende `TitleBar`).
- **Contexto (barra sobre el composer):** conjunto acumulable `context = {allNotes, items}` con items
  `{kind:'section', noteId, sectionId} | {kind:'note', noteId}`. Botones "Sección: X" / "Nota: Y" (lo que
  muestra el panel activo **ahora**, `editorTarget`) añaden/quitan su item (activos si ya está); "Todas
  las notas" es un toggle. Lo añadido de otras notas queda como chip con ✕. Notas cifradas y secciones
  `aiHidden` no se pueden añadir (botón deshabilitado con tooltip); una nota entera manda solo sus
  secciones visibles. **Default de un chat nuevo = la sección abierta, y la SIGUE**: mientras el chat no
  tenga mensajes y el usuario no haya tocado la barra (`contextPinned` false), cada cambio de
  `editorTarget` re-siembra el default (`contextAfterTargetChange`) — así la nota restaurada al arrancar
  no deja un chip viejo si luego se abre otra sección. Añadir/quitar/toggle o enviar el primer mensaje lo
  **congela** (`contextPinned` true) y rige la lógica acumulable; `newChat`/`openSession`/borrar la
  sesión activa vuelven al default sin congelar. El estado vacío del chat compacto usa su propio texto
  (`chat.emptyHintCompact`; el del cerebro habla de iluminar notas). `editorTarget` lo calcula
  la ventana principal (`useSyncChatEditorTarget`: suscripción al `notesStore`, panel activo +
  `getActiveSectionTarget`) y lo reenvía a main en cada cambio (`ai:chat-window-editor-target`).
- **Backend (`ai:chat` con `context`):** `buildChatContext(query, context)`. **Sin `context`** (cerebro) =
  RAG de siempre. **Con `context`:** perfil siempre; los items se leen de disco (`readDiskNote` +
  `chatContext.buildContextBlocks`: sin cifradas ni `aiHidden`, `stripBase64`, cap ~12k chars por item y
  ~40k en total con marca de truncado, cada bloque con `note_id`/`section_id`); una línea con la
  nota/sección abierta (`describeOpenNote`; nunca nombra una sección oculta ni lee una cifrada) para que
  "esta nota" funcione aunque no esté en contexto; y **el RAG (`aiIndex.search` + vecinos) SOLO si
  `allNotes`** (saltando lo ya compartido). El system prompt (`chatContextGuide`) explica el alcance, que
  puede editar con las tools usando esos ids sin buscarlos, que `update_section` reemplaza la sección
  entera y que no reescriba una sección truncada. Las **tools siguen libres**. `sanitizeContextRequest`
  valida el payload (máx. 30 items).
- **Flush antes de leer:** al empezar cada `ai:chat` (y cada undo) main pide a la ventana principal que
  escriba sus guardados con debounce (`ai:flush-edits` → `settleNoteWrites()` → `ai:flush-edits-done`,
  máx. 1,5 s), así el modelo lee la versión actual. Las ediciones de la IA llegan al editor por el
  broadcast `notes-updated` sin senderId → `syncNote` → sync de contenido externo (aplica o fusiona sin
  pisar lo tecleado; ver `patterns.md`).
- **Imágenes en `update_section`:** el modelo solo ve `[image]`; `restoreStrippedImages` (en `tools.ts`)
  devuelve los data URIs originales a los `![alt]([image])` del contenido nuevo **emparejando por
  posición** (n-ésimo placeholder ← n-ésima imagen del original): si el modelo reordena o quita imágenes,
  puede caer la imagen equivocada en un hueco. Los placeholders que sobran (más que imágenes había) se
  **eliminan** en vez de guardarse como imagen rota. `get_note` marca ahora el truncado a 6000 chars por
  sección.
- **Deshacer por edición:** tools en `chatUndo.UNDOABLE_TOOLS` (`create_note`, `update_note`,
  `add_section`, `update_section`, `rename_section`). **No** las de grupo/carpeta ni **`delete_note` /
  `delete_section`**: ya piden confirmación, y restaurar lo borrado chocaría con el borrado remoto que
  dejaron en el journal de sync (`scheduleDeleteDir` / `scheduleDelete`): un borrado pendiente
  (`retrySyncJournal`) o en vuelo (`deleteRemoteDirNow`) podría volver a borrar en remoto —y luego en
  local vía pull— lo restaurado. Main guarda **en memoria** (sesión de app, máx. 200, por `toolCallId`) la nota antes y después de
  la tool (si algo cambió) y añade `undoable: true` al `ai:chat-tool-result`; la fila de actividad
  (`ToolActivityRow`, también en el cerebro) muestra "Deshacer" (deshabilitado mientras hay streaming).
  **Undo a 3 vías** (base = `after`, theirs = disco actual, target = `before`): solo se revierte **lo
  que cambió esa tool**; todo lo demás se queda como está ahora en disco (ediciones del usuario en
  otras secciones, secciones que añadió o borró después, título…). Por partes: cada sección por id
  (cambiada por la tool → vuelve la versión `before`; añadida por la tool → se quita; sin tocar → la
  actual), y cada campo de nota (`title`, `archived`, `favorited`, `group`+`folder` como una
  unidad, `expiresAt`) solo si la tool lo cambió. Los **`tags` no se fusionan**: son derivados (el
  renderer los recalcula del contenido en cada escritura y las tools no los tocan), así que se
  **recalculan del contenido fusionado** (`extractTags` de `llm/tools.ts`, espejo del de
  `noteUtils.ts`); en una nota cifrada se conservan los actuales. El orden de secciones es el actual.
  El `dir` está congelado desde la creación, así que mover de grupo/carpeta no mueve ficheros. Si la
  nota no se puede releer justo tras la tool (`after` nulo) **no se guarda snapshot** (sin base no hay
  merge).
  `ai:chat-undo(toolCallId, force?)`: primero `undoBlock` — **nunca** (ni con `force`) si tendría que
  re-crear la carpeta de la nota o el fichero de una sección **que la tool cambió o quitó** y ya no
  está en disco (`conflict`: se borró después y puede quedar un borrado remoto pendiente para esa
  clave, mismo motivo que arriba; una sección que la tool quitó también se bloquea, por conservador:
  su borrado remoto lo encoló la propia escritura de la tool — las tools deshacibles no quitan
  secciones, en la práctica no ocurre). Borrar después una sección que la tool **no** tocó no bloquea:
  sigue borrada. Tampoco corre si la nota se cifró/descifró después de la edición (`encryption`:
  restaurar escribiría p. ej. una copia descifrada sobre la nota cifrada); la UI lo explica y quita el
  botón. Con la nota cifrada en before/after/actual (la tool solo puede cambiar campos de nota, p. ej.
  `update_note` → grupo) se revierten esos campos y se conserva el `encryption` actual (ciphertext
  incluido). Después, `hasUndoConflict`: devuelve `modified` (la UI pide confirmación y reintenta con
  `force`) **solo** si algo que cambió la tool se cambió otra vez después (por el usuario o por otra
  tool posterior); ediciones ajenas no cuentan. Con `force`, las partes en conflicto vuelven a
  `before` y el resto de ediciones del usuario sobreviven igual. `planUndo` escribe el resultado de
  `mergeUndo` (note.md con `updated` nuevo + solo las secciones que difieren del disco; `deleteFiles`
  solo las que el merge quita) con `applyNoteWrite` durable, `noop` si no queda nada que revertir, o
  borra la nota con `applyNoteDelete` si la creó la tool (ahí cualquier cambio posterior es conflicto y
  la confirmación avisa de que se borrará la nota entera). La fila pasa a "Deshecho"
  (`ChatToolActivity.undo: 'done'`, se persiste). `ai:chats-load` quita el `undo: 'available'` de las
  filas cuyo snapshot ya no existe (tras reiniciar) → sin botón.
- **Ventana despegada ("se muda"):** botón "Open in a separate window" de la cabecera del sidebar
  (deshabilitado con streaming o confirmación pendiente, con tooltip `sidebar.detachBusy`) → `aiChatStore.detachChat()` serializa `ChatHandoff` (messages,
  activeSessionId, draft, context, contextPinned, suggestions, pendingAttachments, `takenAt`) → `ai:chat-window-open`
  → main crea `createChatWindow()` (frameless, opaca como la de sección, `#ai-chat` → rama `chat` de
  `App.tsx`, rol de store `'section'`; bounds en `settings.json → aiChatWindow.bounds`, descartando la
  posición si ya no cae en ninguna pantalla) → la ventana pide el estado (`ai:chat-window-get-state`, que
  incluye el último `editorTarget`). Barra de título propia: zona de arrastre, ⋯ (Volver a la ventana
  principal / Nuevo chat / Historial), chincheta (`setAlwaysOnTop`, desactivada al abrir) y cerrar.
  Mientras está despegada (`aiChatStore.detached` en la principal): el sidebar se pliega, el botón del
  editor enfoca la ventana y la pestaña chat del cerebro muestra un placeholder con "Mostrar ventana" /
  "Traer aquí" (`ai:chat-window-recall`) — **un solo renderer escribe `ai-chats.json`**. **Vuelta:**
  cualquier cierre (botón, Volver, Alt+F4, recall) pasa por `close` en main → `ai:chat-window-request-close`
  → la ventana cancela el streaming si lo hay y manda su estado (`ai:chat-window-return`) → main lo
  reenvía a la principal (`ai:chat-window-returned`) y destruye la ventana; si el renderer no contesta en
  2,5 s se cierra igual con `null`. La principal recarga las sesiones del disco, abre el sidebar e
  importa el estado. **Handoff nulo o viejo:** la copia que la principal congeló al despegar (o el handoff
  de despegue que main vuelve a servir a una ventana recargada tras un crash) no tiene los turnos hechos
  en la ventana, que ya están en `ai-chats.json`; si se importara tal cual, el siguiente `persist()` los
  pisaría. `lib/chatHandoff.reconcileHandoff` (tests en `tests/lib/chatHandoff.test.ts`) hace que gane la
  sesión guardada (`activeSessionId`) cuando su `updatedAt` es posterior a `takenAt`, o siempre si la
  copia no tiene `takenAt` (la congelada de la principal con handoff nulo); borrador y contexto se
  conservan. Abrir una nota o los ajustes de IA desde la ventana va por `ai:chat-window-command` → main
  enfoca la principal y se lo reenvía. **"Ask AI"** de la paleta con el chat despegado no abre el
  cerebro: `openAiPanel` lo manda por `ai:chat-window-ask` → main enfoca la ventana → `askInNewChat`
  (chat nuevo con "Todas las notas" activado, el alcance del "Ask AI" del cerebro; sin proveedor, queda
  como borrador). Si la principal se destruye, la de chat también; tras una recarga de la principal,
  `ai:chat-window-is-open` restaura el `detached`.
