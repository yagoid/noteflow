## Patrones y decisiones de arquitectura

### Carga de notas en batch
`loadNotes()` usa `fs:read-all-notes` (un solo IPC, con reintentos ante FS no listo en Windows
al despertar/arrancar). Crítico para el tiempo de arranque con muchas notas.

### Rendimiento del sidebar y la búsqueda (escala = miles de notas)
Dos invariantes para que el sidebar siga fluido con muchas notas — fáciles de romper sin querer:
- **Búsqueda cacheada (`src/lib/searchUtils.ts`):** `getNoteSearchIndex(note)` normaliza
  título/tags/nombres/cuerpos de sección **una vez por versión de nota** y los guarda en un
  `WeakMap` keyed por el **objeto `Note`**. Como `updateNote` siempre crea un objeto nuevo al
  editar, la entrada se invalida sola (y la vieja se recolecta con el objeto). Toda búsqueda sobre
  el cuerpo (`Sidebar.notes`, `notesStore.getFilteredNotes`, `CommandPalette`) debe ir por esta
  caché vía `getNoteSearchIndex`/`noteMatchesQuery` — **nunca** re-`normalize()` el contenido entero
  por tecla (era O(texto total) por carácter).
- **Filas memoizadas (`Sidebar.tsx`):** cada nota se pinta con `NoteRow` (`React.memo`). Para que la
  memoización aguante, a `NoteRow` solo se le pasan **props estables/primitivas** y un objeto
  `handlers` de **identidad fija** (`useMemo([])`) que delega a un `rowApiRef` refrescado en
  `useLayoutEffect` cada render (closures frescos que leen `items`/`noteOrder`). Así, al teclear en
  el editor (que dispara `updateNote`) solo se re-renderiza la fila de la nota editada, no todas.
  **No pasar callbacks recreados por render a `NoteRow`** (rompería el memo y volvería el storm).
- **Pendiente:** virtualización real (windowing de filas fuera de pantalla) — aún se montan todas
  las filas en el DOM; el árbol anidado con grupos/carpetas colapsables + drag&drop lo hace no
  trivial.

### Importación desde otras apps (`electron/importers/`, `src/lib/notionHtml.ts`)
Importa notas de **Markdown folder**, **Notion** (export HTML `.zip`) y **Google Keep** (Takeout
`.zip`) reutilizando el pipeline de import existente (preview → conflictos → `notes:write-imported`).
Dep nueva: `adm-zip` (JS puro, sin binario nativo → no toca `asarUnpack`/postinstall).
- **Reparto main/renderer (clave):** `htmlToMarkdown` (`src/lib/markdownHtml.ts`) usa `DOMParser` →
  **solo corre en el renderer**. Por eso el **main** (`electron/importers/{index,markdownFolder,notion,
  googleKeep}.ts`, vía IPC `notes:parse-external-import`) hace **solo IO**: unzip/recorrer carpetas y
  emitir un intermedio `ExternalNote[]` (`{title, format:'html'|'md', body, tags?, created?, archived?,
  favorited?, relPath[]}`). El **renderer** (`ExportImportModal.tsx`) convierte `html→md`
  (`notionHtml.notionBodyToMarkdown`, normaliza markup Notion→TipTap antes de `htmlToMarkdown`),
  resuelve `relPath → grupo/folder` (`makeStructureResolver`, fusiona por nombre con `groupsStore`),
  y serializa al v2 con `serializeNoteFolder`.
- **Notion HTML:** maneja **ZIP anidados** (`Export-…-Part-N.zip`), quita el sufijo hex-32 de
  nombres/carpetas, descarta wrappers `Export-*` y la **raíz workspace única** (sus hijos → grupos),
  extrae `.page-title`/`.page-body`, convierte to-do lists (estado del checkbox), preserva embeds
  (links de `<figure>`) y **descarta imágenes y `.csv`** (v1).
- **Google Keep:** Takeout trae **un `.json` por nota** pero la **carpeta de Keep está localizada**
  (ES = "Conservar", etc.), así que NO se filtra por ruta `/Keep/` sino por **forma de la nota**
  (`isKeepNote`: tiene `textContent`/`listContent`/`isTrashed`/`userEditedTimestampUsec`…). Mapea
  `textContent`+`listContent`(→checkboxes), `labels`→tags, `isArchived`/`isPinned`, timestamps µs;
  omite `isTrashed`. Sin `relPath` (Keep no tiene carpetas).
- **Decisiones de UX:** contenido importado en **rich-text** (`isRawMode:false`); **notas sin
  contenido se omiten** (filtradas en preview por `externalContent()`); los **grupos/folders se crean
  solo al confirmar** (previsualizar y cancelar no deja rastro). Nesting >2 niveles se aplana a
  grupo + folder (`'A / B'`). Tutorial in-app por fuente en el selector de origen.
- **Sync:** `notes:write-imported` sube las notas con `pushPathsNow` (push durable awaited por lotes)
  en vez de `schedulePush` por archivo, para que un pull de auto-sync no las borre a mitad del import
  (ver "GitHub Sync" → Push).
- **Smokes:** `scripts/import-notion-smoke.cjs` (node, lado main: hex/wrappers/relPath) y
  `scripts/import-notion-verify.cjs` (e2e: corre la conversión REAL del renderer en una ventana
  oculta de Electron + esbuild, escribe a un dir temporal; valida 0 pérdida de contenido).

### Vista de grupo (group overview)
`notesStore` tiene `groupViewId: string | null` + `setGroupView(id)`. Cuando no es `null`,
`App.tsx` renderiza `GroupOverview` en lugar del editor/paneles (sidebar y TitleBar siguen
montados). `setActiveNote()` limpia `groupViewId` (seleccionar cualquier nota cierra la vista y
devuelve el editor). El componente reutiliza `useSidebarGroups` y `updateNote({group,folder})`
para reorganizar por drag&drop. La navegación a una sección concreta usa `pendingInitialSectionId`
+ un `noteflow:request-section` diferido con `setTimeout(0)` (el editor monta tras cerrar la vista;
bajo StrictMode el efecto de montaje consume el `pending` dos veces, de ahí el re-aviso por evento).
El ancho de tarjeta se guarda en `localStorage` (`noteflow:group-view-card-width`). Sin IPC nuevo.
`App.tsx` **keya la vista por `groupViewId`** (igual que `NoteOverview` por `noteViewId`): cambiar de
grupo remonta el componente, así que la selección múltiple y el resto de estado local (rename inline,
popover de color) no se filtran al grupo nuevo — importante porque las acciones por lotes se calculan
contra `notes` global, no contra la vista.
**Selección múltiple:** estado local `selectedIds: Set<string>` en `GroupOverview`; cada `NoteCard`
recibe `selected`/`selectionActive`/`onToggleSelect` y muestra una checkbox (hover o marcada).
**Select-all a dos niveles:** el memo `allViewNotes` (notas de las carpetas + sueltas + archivadas, en
orden de render) es la única fuente para el botón "Select all/Deselect all" de la cabecera y su atajo
`Ctrl/Cmd+A` (mismo `toggleSelectAll`, con la guarda de INPUT/TEXTAREA/contentEditable y sin `alt`/`shift`,
que también cubre los inline-edit); cada `Band` recibe `allSelected`/`someSelected`/`onToggleSelectAll`
(helper `bandSelectProps`) y pinta una checkbox tri-estado en su cabecera que solo añade/quita las notas
de esa banda (estado parcial → `aria-checked="mixed"` + icono `Minus`). Las
acciones por lotes (`SelectionBar`, componente al pie del mismo archivo) reusan los primitivos del
store: `updateNote({favorited})`, `archiveNote` (toggle), `updateNote({group,folder})` y `deleteNote`
iterando sobre la selección (favorite/archive calculan el target como `!todasYaLoTienen`); el borrado
pasa por `ConfirmModal`. **Color del grupo:** el punto de la cabecera es un botón que abre un popover
con la paleta `TAG_COLOR_VARS` + el swatch de color libre (`CustomColorSwatch`) y llama a
`useGroupsStore.setGroupColor` (misma acción que usa el color picker del menú contextual del sidebar). `Esc` cierra el popover de color si está abierto; si no, limpia
la selección; si no, cierra la vista (los inline-edit siguen gestionando su propio `Esc`). Sin IPC nuevo.

### Vista de nota (note overview)
`notesStore` tiene `noteViewId: string | null` + `setNoteView(id)`. Es una de las **vistas full-area
mutuamente excluyentes** (group / note / brain / all-content): todos los setters (`setGroupView`,
`setNoteView`, `setBrainView`, `setAllView`) y `setActiveNote` se limpian entre sí, así que abrir una
cierra las otras y seleccionar una nota devuelve el editor. `App.tsx` la renderiza (`NoteOverview`) con la
prioridad de routing (all-content → brain → group → note → editor). **Entradas:** botón en la toolbar de
`NoteEditor` (junto a la estrella) y el ítem "Note overview" del menú contextual del sidebar. Una
**tarjeta por sección** que es un mini-mock del editor: etiqueta de sección, título+`created` de la
nota, una barra-toolbar puramente representativa, y un **preview del contenido renderizado** con
`htmlFromMarkdown` (de `lib/markdownHtml.ts`) dentro de `.prose-editor .ProseMirror`, encogido con
CSS `zoom` (Chromium/Electron) y recortado a unas líneas con fade. El mock visual vive en
`SectionPreview/SectionPreviewCard.tsx` (componente puro, props `compact`/`previewHeight`/`previewZoom`);
`NoteOverview` lo envuelve en su `<button>`. Click en una tarjeta navega a esa sección con el mismo baile
`pendingInitialSectionId` + `noteflow:request-section` diferido. Ancho de tarjeta **fijo** (sin slider).
Las notas cifradas bloqueadas muestran un estado "encrypted". Sin IPC nuevo.
**Header:** el `<h1>` del título es **editable inline** (click o icono lápiz en hover → `<input>` con
autofocus+select, commit debounced en blur/Enter, Esc revierte — mismo patrón que `NoteEditor`); no editable
cuando `locked`. Botón **Delete note** (rojo, junto a cerrar) abre `ConfirmModal` `danger` y llama
`deleteNote(note.id)` (el effect que cierra al desaparecer la nota gestiona el cierre).
**Multi-selección de secciones:** estado local `selectedIds: Set<string>` (por id, nunca índice) en
`NoteOverview`; `App.tsx` keya la vista por `noteViewId` así que cambiar de nota remonta y resetea la
selección sin effects. Cada `SectionCard` recibe `selected`/`selectionActive` y un checkbox (esquina sup-izq,
visible en hover o siempre con ≥1 marcada; estado marcado en `accent`). Modificadores en el click de la card:
Ctrl/Cmd-click togglea, Shift-click selecciona el rango (orden `note.sections`) desde el ancla (`anchorIdRef`),
click normal abre la sección. La barra de selección (fila bajo el header) muestra `"N selected"` + **Hide/Show
to AI** (solo `!note.encryption`; "Show to AI" si todas las marcadas tienen `aiHidden`), **Delete** (deshabilitado
con tooltip si la selección == todas las secciones — borrarlas todas dejaría la nota vacía; confirma con
`ConfirmModal`) y **Clear**. El conteo/derivados se calculan filtrando `selectedIds` contra `note.sections`
(no se filtra el Set en un effect). `Esc` limpia la selección antes de cerrar la vista.
**Nota CSS:** el reset global `button { border: none }` deja `border-style: none`, así que las tarjetas usan `border-solid` explícito para
que el borde se vea (la utilidad `border` de Tailwind solo fija el ancho).

### Vista "All content" (índice global)
`notesStore` tiene `allViewOpen: boolean` + `setAllView(open)`. Es la **cuarta vista full-area** (prioridad
de routing más alta en `App.tsx`: all-content → brain → group → note → editor). **Entrada:** botón "View all
content" (icono `LayoutGrid`) en la cabecera del sidebar, bajo "+ New note". El componente
(`AllContentOverview/AllContentOverview.tsx`) modela su layout sobre `GroupOverview` (header fijo + área scroll
+ grids `repeat(auto-fill, minmax(220px,1fr))`) y muestra TODO el contenido visible en bandas: **Favorites**
(notas `favorited`), **Groups** (un `GroupTile` compacto por grupo no-archivado: barra de color + icono `Folder`
tintado + nombre + nº de notas) y **Notes** (notas sueltas/ungrouped).
**Groups desplegables (acordeón):** cada `GroupTile` es un `<div>` (no `<button>`, para anidar acciones sin
botón-dentro-de-botón) con un botón principal que **expande/colapsa inline** (chevron que rota 90°) y un botón
secundario `Maximize2` ("Open group view", visible en hover) que entra al grupo (`openGroupFromAll`). El botón
principal es `w-full min-h-[78px]`, así que **todo el área del tile es clicable** para desplegar/plegar; el botón
secundario (`absolute z-10` + `stopPropagation`) y la barra de color (`absolute z-10`) quedan por encima y siguen
funcionando. Al expandir, un **panel hermano a ancho completo** cae en la rejilla (`gridColumn: '1 / -1'`,
borde-izq con el color del grupo) que muestra las notas sueltas del grupo y sus folders (con sub-cabecera
`Folder`/`FolderOpen` colapsable) con sus notas — igual que el sidebar, reutilizando `OverviewNoteCard`. Ese panel
se envuelve en un componente local **`AccordionPanel`** que anima la apertura/cierre con la técnica
`grid-template-rows: 0fr↔1fr` + `overflow-hidden` (misma que el sidebar, ~200ms ease, con un leve fade de
opacidad). El **mismo `AccordionPanel` también envuelve la rejilla de notas de cada folder** dentro del panel del
grupo, así que plegar/desplegar un folder tiene idéntica animación. El `gridColumn: '1 / -1'` (que hace caer el
panel del grupo a ancho completo en la rejilla de tiles) **no está hardcodeado**: `AccordionPanel` acepta una prop
opcional `style?: React.CSSProperties` que se mezcla en su wrapper externo — el uso del **grupo** pasa
`style={{ gridColumn: '1 / -1' }}` y el uso del **folder** (que vive en un `space-y` normal, no en la rejilla de
tiles) no pasa style. El contenido del `GroupTile` se alinea arriba (`items-start`) ya que el tile es alto
(`min-h-[78px]`). **Por rendimiento, las previews de notas solo se montan cuando el grupo está expandido** (cada
`OverviewNoteCard` pinta markdown y es caro): se mantienen montadas durante la animación de cierre y se desmontan
en `onTransitionEnd`. La animación de apertura se dispara montando a `0fr` y pasando a `1fr` en el siguiente frame
(`requestAnimationFrame`). **Estado de expansión LOCAL a
la vista** (`expandedGroupIds`/`collapsedFolderIds` como `Set`), **colapsado por defecto**, no persistido (no usa
`groupsStore`). Con búsqueda activa, todos los grupos/folders visibles se tratan como expandidos y las notas
mostradas se filtran a las que matchean (revela resultados); las folders que quedan vacías con la query se omiten. Reutiliza
`useSidebarGroups` para derivar grupos/sueltas y `OverviewNoteCard` para las tarjetas de nota (color = el del
grupo de la nota, o `--text-muted` si no tiene). Búsqueda local (`searchQuery` de estado, **no** el global del
store) con `parseSearchQuery`/`noteMatchesQuery` de `lib/searchUtils`: filtra favoritos y sueltas, y muestra un
grupo si su nombre matchea o si contiene alguna nota que matchee. Click en sección usa el mismo baile
`pendingInitialSectionId` + `noteflow:request-section` diferido. `Esc` cierra. Sin IPC nuevo.
**Filtro de fecha/calendario (vive AQUÍ, no en el sidebar):** toolbar fija bajo la cabecera con los botones
segmentados `All/Today/Week/Month` + toggle de calendario desplegable. Lee `filterDate`/`setFilterDate` del
`notesStore` (campo compartido) y mantiene estado **local** `selectedDayKey`/`calendarMonth`/`calendarExpanded`.
El filtrado (`dateBaseNotes` no-archivadas → `dateFilteredNotes`) replica la lógica que antes vivía en el
sidebar: con día elegido, notas creadas o modificadas ese día; si no, rango sobre `updated`. Se aplica al
**conjunto base** (`visibleNotes`) antes de derivar favoritos/grupos/sueltas, así que afecta a las tres bandas
y se combina con la búsqueda local. `calendarDays`/`dayMarkers` (puntos verde=created, neutro=updated) se
calculan como en el sidebar (helpers `toDayKey`/`toDayKeyFromIso`/`dayKeyToDate` a nivel de módulo). El
sidebar ya **no** tiene este filtro (solo búsqueda/tags/archived); su botón "All content" perdió el borde.
**Back inteligente:** entrar a un grupo/nota DESDE esta vista usa `openGroupFromAll(id)`/`openNoteFromAll(id)`,
que marcan `cameFromAllView: true`. El "atrás" de group/note overview llama a `closeFullView()`: si
`cameFromAllView` vuelve a "All content" (no al editor); si no, cierra al editor. Cualquier `setActiveNote`/
creación de nota limpia `allViewOpen` y `cameFromAllView`.
**OverviewNoteCard compartida:** la tarjeta de nota (antes inline en `GroupOverview`) vive en
`components/OverviewNoteCard.tsx` (exporta `OverviewNoteCard`, `NoteCardProps` y la helper `formatCardDate`);
la usan group overview y all-content. Las props de reorder/selección son opcionales (la all-content no las pasa).

### Previsualización de sección (hover + cerebro)
Reutiliza `SectionPreviewCard` en dos interacciones, sin IPC nuevo (el contenido de toda sección ya está
en memoria en `notesStore`):
- **Hover** (`SectionPreview/HoverPreviewProvider.tsx`, montado en `App.tsx`): un **único** popover en
  portal a `document.body`. El hook `useSectionHoverPreview()` (en `hoverPreviewContext.ts`, archivo
  aparte por la regla `react-refresh/only-export-components`) expone `previewProps(noteId, sectionId, opts)`
  que devuelve handlers de ratón para escupir sobre cualquier disparador. Disparadores cableados:
  `SectionTabsRow` (sidebar + group overview), pestañas del editor (omite la activa), `RelatedView`/`ChatView`.
  `placement: 'cursor-below'` ancla la esquina sup-izq junto al cursor (sidebar/grupos/editor);
  `'element-right'` (default) al lado del elemento (IA). Retardo ~380 ms; el popover es `pointer-events-none`
  y se cierra con **cualquier click** (listener `pointerdown` global en el provider — esto evita que se quede
  pegado al pasar una pestaña del editor a "activa" y perder sus handlers). `title:''` en los handlers
  suprime el tooltip nativo del ancestro. Posición flash-free: primera pintura con altura estimada +
  `opacity:0`, se mide en `useLayoutEffect` y se revela.
- **Cerebro** (`Brain/BrainNodePreview.tsx`): NO es hover. Click en un nodo nota/sección llama
  `onNodeActivate(noteId, sectionId, clientX, clientY)` (en vez de navegar) → `BrainView` fija una tarjeta
  **clicable** junto al click; pulsarla navega (`openNote`), click fuera o `Esc` la cierra. Sustituyó al
  antiguo "fly-in" de cámara (eliminado).

### Editor: marcas y bloques markdown (round-trip md↔html)
El editor TipTap (`src/components/Editor/Editor.tsx`) registra las extensiones **una a una** (sin
StarterKit). Todo elemento soportado **round-trippea** por `src/lib/markdownHtml.ts`, fuente única de
verdad de la conversión, que debe mantenerse **simétrica**: marcas inline en
`inlineToHtml`/`inlineElToMd`, bloques en el bucle de `htmlFromMarkdown`/`blockElToMd`. Las mismas
funciones las usa `SectionPreviewCard`, así que un elemento nuevo aparece también en los previews sin
código extra (estilo por selector `.prose-editor .ProseMirror …` en `index.css`).
- **Bold neutro + highlight de acento (decisión):** la negrita (`**`) ya **no** usa el color de
  acento (`strong { color: inherit }`); el texto en color de acento es una marca aparte, **highlight**
  `==texto==` → `<mark>` (`@tiptap/extension-highlight`, `multicolor` off; `mark { color: var(--accent);
  background: transparent }`). Botón en la toolbar (icono `Highlighter`).
- **Blockquote / cita (`> texto`, estilo VSCode):** `@tiptap/extension-blockquote`. Round-trip con
  `mdBlockquoteToHtml` (líneas consecutivas → `<p>` con `<br>`; línea `>` vacía → nuevo párrafo) y el
  caso `blockquote` en `blockElToMd` (prefija cada línea con `> `). Estilo: borde izquierdo del color
  compartido `--code-accent` (fallback `--accent`; el mismo que el borde del `pre`, personalizable —
  ver "Colores del editor") + texto atenuado. Botón en la toolbar (icono `Quote`).
- **Bloque de código — selector de lenguaje (`CodeBlockWithCopy.tsx`):** el NodeView de
  `CodeBlockLowlight` pinta a la izquierda (`top-2 left-2`) un botón con el lenguaje actual ("Plain
  text" si `language` es null) y a la derecha el botón Copy. El botón izquierdo abre un dropdown
  (portalado a `document.body` con `createPortal`, `position: fixed` para no recortarse con el
  `overflow-x:auto` del `pre`) con buscador + "Plain text" (fija `language=null`) + los lenguajes de
  `extension.options.lowlight.listLanguages()` (se filtra `plaintext`, ya cubierto por "Plain text"),
  ordenados por label legible (`LANGUAGE_LABELS`, fallback = capitalizar id). **Se guarda siempre el id
  real de lowlight** en `node.attrs.language` (no el label) para no romper resaltado ni round-trip. El
  botón se muestra siempre sutil si hay lenguaje (`opacity-60`) o solo en hover si es plain text.
  Posiciona con `getBoundingClientRect()/getRootZoom()` (mismo truco de zoom que `SlashCommands`);
  cierra con click-fuera y Escape. No toca `markdownHtml.ts` ni el formato. Estilos `.code-lang-*` en
  `index.css`.
- **Orden de detección de bloque** en `htmlFromMarkdown`: code fence → heading → HR → lista →
  blockquote → tabla → párrafo (un prefijo `>` no choca con bullets/ordenadas/headings).
- **Code fences pegados a otro contenido (`isolateCodeFences`):** el code fence solo se detecta como
  **primera línea de un bloque**, y los bloques se cortan por `\n\n`. Por eso, antes del split, una
  pre-pasada por líneas:
  1. **Empareja** fences de izquierda a derecha: apertura = línea en columna 0 que empieza por
     ```` ``` ````; su cierre = la **primera** línea posterior en columna 0 que es solo ```` ``` ````;
     las líneas entre medias son contenido (no aperturas). Una apertura sin cierre no se empareja y
     **no se toca** (el resto de su bloque es código, como siempre). Los fences indentados (dentro de
     un ítem de lista) no se consideran. **Racha de cierre:** las líneas ```` ``` ```` sueltas pegadas
     justo tras un cierre, si la racha termina en línea vacía o fin de texto, son parte del cierre de
     ese mismo bloque y **no abren** par (ver "Bloque que termina en un snippet anidado" abajo).
  2. Las líneas vacías dentro de un par pasan a ser el centinela `FENCE_BLANK` (se borra al pintar el
     `<pre>`), para que el split no parta el código.
  3. Asegura un **límite de bloque antes de la apertura** de cada par (añade una línea vacía solo si
     falta, contando la paridad de `\n`: el split consume pares desde la izquierda).
  4. El bloque de código llega, como siempre, hasta el **último** cierre de su bloque `\n\n` (no el
     primero); solo si tras ese último cierre hay contenido pegado (sin línea en blanco) se añade un
     límite ahí.

  Por qué el **último** cierre: `blockElToMd` siempre escribe fence de 3 backticks, así que un bloque
  de código cuyo contenido tiene sus propias líneas ```` ``` ```` (un snippet de README) se serializa
  como **fences anidados** (```` ```md ```` / ```` ```js ```` / `foo` / ```` ``` ```` / ```` ``` ````).
  Cerrar en el primer cierre perdería esas líneas y el editor guardaría la estructura rota en la
  siguiente edición. Ambigüedad resultante (aceptada): dos fences pegados sin línea en blanco
  entre ellos se leen como **un** bloque con el segundo fence dentro.

  Resultado: un párrafo, un fence y una tarea sin líneas en blanco entre ellos (típico del LLM en el
  chat) dan párrafo + código + tarea en vez de meter la tarea dentro del código o el fence dentro del
  párrafo. El markdown **bien separado** (cada bloque termina en exactamente `\n\n` y un fence acaba en
  su línea de cierre, que es lo normal en lo que emite `htmlToMarkdown`, fences anidados incluidos) se
  pinta **igual que antes** de esta pre-pasada, sin `<p></p>` espurios, salvo el arreglo del bloque que
  termina en snippet anidado (abajo). Diferencias conocidas, todas en casos que antes ya salían mal:
  - **Dos o más líneas vacías seguidas** dentro de un fence ahora se conservan (antes partían el bloque).
  - Un párrafo que acaba en hard break justo antes de un fence (`a\n` + `\n\n` → racha impar de `\n`):
    antes el fence salía como texto; ahora sale `<p></p>` + código.
  - Líneas que son literalmente ```` ``` ```` en columna 0 dentro de un párrafo o ítem de lista (soft
    breaks) y que se emparejan entre sí: antes eran texto; ahora se aíslan como bloque de código.

  **Bloque que termina en un snippet anidado (racha de cierre):** si el contenido de un bloque de
  código **termina** en una línea ```` ``` ```` suelta, se escribe `…` / ```` ``` ```` / ```` ``` ````
  + `\n\n`. Antes, esa última ```` ``` ```` (el cierre real) se tomaba como apertura y se emparejaba
  con el siguiente fence de la sección **aunque hubiera líneas en blanco entre medias**, fusionando
  todo lo de en medio en un único bloque de código que el editor guardaba así en la siguiente edición
  (pérdida de estructura). Ahora, al emparejar, las ```` ``` ```` sueltas pegadas tras un cierre cuya
  racha acaba en línea vacía/fin de texto **no abren par**: el bloque llega hasta la última de ellas
  (coherente con "hasta el último cierre de su bloque `\n\n`"). Si la racha va seguida de contenido
  sin línea en blanco, se empareja como siempre (el bloque continúa). Una ```` ``` ```` suelta que
  **no** va pegada a un cierre sigue abriendo un par que puede cruzar líneas en blanco (es el fence
  normal `para` / *blank* / ```` ``` ```` / `a` / *blank* / `b` / ```` ``` ````).

  **Ambigüedades que quedan** (inherentes a escribir fences anidados con 3 backticks; no se cambia el
  formato en disco por los 3 espejos desktop/CLI/móvil). Las conocidas, **no** es una lista exhaustiva:
  - **Coste de la racha de cierre (nuevo):** se dispara cuando el contenido del código tiene **dos
    líneas ```` ``` ```` sueltas seguidas, luego una línea en blanco y más contenido** antes del cierre
    real. En la práctica: anidamiento de **3 niveles**, o un snippet suelto que empieza por línea en
    blanco pegado justo tras otro snippet. Es indistinguible del caso arreglado. Consecuencias (en
    HEAD esto hacía bien el round-trip):
    - Sin más fences en la sección (```` ```md ```` / `a` / ```` ``` ```` / ```` ``` ```` / *blank* /
      `b` / ```` ``` ````): código `a` + ```` ``` ```` y un párrafo `b` + ```` ``` ````.
    - **Con otro fence más adelante** (… `b` / ```` ``` ```` / *blank* / `q` / *blank* /
      ```` ```py ```` / `x` / ```` ``` ````): la ```` ``` ```` que queda bajo `b` abre un par con el
      cierre del bloque posterior y **fusiona todo lo de en medio** en un bloque de código sin
      lenguaje (código `a` + ```` ``` ````, `<p>b</p>`, y un código sin lenguaje con la línea vacía,
      `q`, la línea vacía, ```` ```py ```` y `x`). Es el mismo tipo
      de fusión que el bug arreglado, pero aquí sobre contenido que antes sí hacía bien el round-trip.
    - Balance: mejora neta. Con anidamiento de **2 niveles** (el caso realista: un snippet de README
      dentro de un bloque `md`), el fuzz del reviewer solo encontró arreglos y ninguna rotura.
  - **Snippet anidado seguido de línea en blanco y más texto dentro del mismo bloque** (igual que
    antes; probablemente la más común): ```` ```md ```` / ```` ```js ```` / `foo` / ```` ``` ```` /
    *blank* / `text` / ```` ``` ```` da código `md` con ```` ```js ```` + `foo` (se pierde el cierre
    anidado) y un párrafo `text` + ```` ``` ````.
  - Un snippet anidado que **abre con ```` ``` ```` suelto** y tiene líneas en blanco dentro se parte
    en código vacío + párrafos (igual que antes).
  - Bloque que termina en snippet anidado con contenido **pegado** detrás (sin línea en blanco; no lo
    escribe NoteFlow, solo markdown externo/LLM) y otro fence más adelante: sigue fusionando (igual
    que antes).
  - Fences de 4 backticks: la apertura cuenta como fence de 3 con lenguaje `` `md `` y la línea de 4
    nunca cierra. `~~~` no es fence. (Igual que antes; solo afecta a markdown externo.)

  Tests en `tests/lib/markdownHtml.test.ts`.
- **Invariante del separador de bloque en `blockElToMd`:** cada bloque serializado debe terminar en
  **exactamente `\n\n`** (`htmlFromMarkdown` separa bloques con `split(/\n\n/)`). Ojo con quién pone
  el separador: `tableElToMd` **ya devuelve** su `\n\n` final (el caso `table` no debe añadir nada),
  mientras que `listElToMd` cierra el último ítem con un solo `\n` y por eso el caso `ul`/`ol` sí
  suma `+ '\n'`. Un `\n` de más tras un bloque hace que el siguiente se reparsee con un hard break
  inicial (`<p><br>…`) y el hueco **crece en cada round-trip** guardar/reabrir (bug real con tablas).
- Estos elementos son **markdown plano** en el cuerpo del `.md`: no tocan el frontmatter ni los tres
  espejos del formato (`noteUtils`/`noteFormat`/`cli`), así que sincronizan y se degradan limpio en
  editores externos/CLI/móvil.

### Editor: la tira de tabs sigue a la sección activa
En `NoteEditor.tsx`, la tira horizontal de pestañas (`tabsScrollRef`) se auto-scrollea para dejar
visible el tab activo. Decisiones a respetar si se toca:
- **Un solo efecto centralizado** (`useLayoutEffect`), no lógica repetida en cada handler: la sección
  activa cambia desde muchos sitios (click, `Ctrl+Tab`, `noteflow:request-section` del sidebar,
  alta/borrado/undo de sección, restaurar la sección recordada al cambiar de nota).
- **Firma de pertenencia, no de orden** (`sections.map(id).sort().join('|')` como dep). Dos motivos:
  ignora el tecleo (`updateNote` crea un array de secciones nuevo en cada edición) y **no dispara al
  reordenar** — tras soltar un tab arrastrado desde el final, un scroll de vuelta al tab activo
  escondería justo lo que se acaba de mover. Que la sección activa siga visible **mientras** se
  arrastra lo cubre el auto-scroll por bordes, no este efecto.
- **Nada de `scrollIntoView()`**: arrastraría a los ancestros scrollables y descolocaría el layout.
  El helper `revealSectionTab()` calcula el `scrollLeft` objetivo con `offsetLeft`/`offsetWidth` del
  tab (localizado por `data-section-id`) y `scrollLeft`/`clientWidth` de la tira, deja ~12 px de
  margen, descuenta los ~24 px del degradado de fade derecho y **no hace nada si ya está visible**.
  Se usa `offsetLeft` y no `getBoundingClientRect()` a propósito: es el mismo espacio de coordenadas
  que `scrollLeft`, así que el zoom de UI no lo afecta (ver "UI text size").
- `behavior: 'auto'` (salto) la primera vez que se revela una nota — el efecto reintenta en un
  `requestAnimationFrame` si la tira aún no está medida —, `'smooth'` para cambios dentro de la nota.
  ⚠️ Al cambiar de nota **hay un commit intermedio** en el que `activeSectionId` (estado) es todavía
  el de la nota anterior y `activeSection` cae al fallback `sections[0]` — el efecto de reset que lo
  corrige es passive y corre *después*. El efecto **se salta ese render** (guarda: el `activeSectionId`
  de estado no pertenece a `note.sections`) y no consume el flag de "primera vez"; si no, la tira
  saltaría al principio y luego barrería en `'smooth'` hasta la sección recordada.
  Esa guarda es **incondicional a propósito** — no vale limitarla al primer render de la nota:
  `noteflow:request-section` hacia *otra* nota hace `setActiveSectionId` un commit antes de que llegue
  la nota (el sidebar despacha el evento síncrono antes de `setActiveNote`), y ahí el flag de "primera
  vez" ya está gastado, así que la tira barrería en `'smooth'` hasta el tab #1 de la nota **vieja**
  justo antes del swap. Trade-off asumido: si sync/CLI borra desde fuera la sección activa de una nota
  ya asentada, la tira no persigue al fallback `sections[0]` hasta el siguiente cambio de sección.
- **Auto-scroll por bordes al arrastrar** un tab: el `onDragOver` de la tira mira si el puntero está
  en los ~40 px de un borde y arranca un bucle `requestAnimationFrame` (~10 px/frame). El rect de la
  tira y el zoom se **miden una vez en `dragStart`** (llamarlos por evento forzaría layout en cada
  `dragover`); `clientX` es espacio local y el rect de dispositivo → se divide por `getRootZoom()`
  antes de compararlos. El bucle se para en `onDrop`/`onDragEnd`/`onDragLeave` de la tira (este
  último con guarda `contains(relatedTarget)`, porque `dragleave` burbujea al pasar de un tab a
  otro), en listeners `dragend`/`drop` en `window` (capture) para arrastres que acaban en otro
  destino, en el cleanup del efecto, y —último agujero— con un **watchdog** de 800 ms sin `dragover`
  dentro del propio bucle: si el tab origen se desmonta a mitad de arrastre (p. ej. un pull de sync
  que cambia el set de secciones) su `dragend` se dispara en un nodo desconectado y no llega a nadie.

### Relaciones sección↔sección (slash command + cerebro)
Enlaces explícitos que el usuario crea **inline mientras escribe**: en el editor rich teclea `/` →
menú de comandos → "Link section" → buscador de secciones → inserta una **pill** que enlaza a otra
sección (de cualquier nota/grupo). Click navega; hover muestra el preview estándar; aparece como
arista en el cerebro **aunque la IA esté apagada**.
- **Fuente única de verdad = inline en el markdown** de la sección:
  `[Nombre](noteflow://<noteId>/<sectionId>)`. NO toca el frontmatter ni los tres espejos del
  formato (`noteUtils`/`noteFormat`/`cli`) — es texto plano en el `.md`, así sincroniza, hace
  round-trip y se degrada a un link inocuo en editores externos/CLI/móvil. Helpers en
  `src/lib/sectionRelations.ts` (`buildRelationUrl`, `parseRelationUrl`, `extractSectionRelations`).
- **Round-trip md↔html** (`src/lib/markdownHtml.ts`): `inlineToHtml` convierte el link `noteflow://`
  en `<span data-type="section-relation" data-note-id data-section-id>` **antes** del regex genérico
  de links; `inlineElToMd` lo revierte. Por eso `SectionPreviewCard` (que usa `htmlFromMarkdown`)
  pinta la pill en los previews sin código extra (estilo por atributo en `index.css`).
- **Editor (`src/components/Editor/`):** `SectionRelation.ts` (nodo inline atom + comando
  `insertSectionRelation`, NodeView React `SectionRelationView.tsx`: nombre en vivo desde el store,
  estado "roto" si el destino no existe, hover vía `previewProps`, click vía
  `notesStore.navigateToSection`). El slash usa **`@tiptap/suggestion`** (dep nueva, JS puro):
  `SlashCommands.ts` (Suggestion `char:'/'`, off en code blocks) + `SlashCommandMenu.tsx` (popup
  comandos) + `SectionLinkPicker.tsx` (overlay buscador). `Editor.tsx` registra ambas extensiones y
  abre el picker con estado local. Solo en modo rich; en raw se ve el markdown literal.
- **Navegación:** `notesStore.navigateToSection(noteId, sectionId)` encapsula el patrón
  pending+`request-section` (reutilizable; mismo que overviews/cerebro).
- **Cerebro (capa de relaciones):** `useBrainGraph` añade `relationEdges` derivado de escanear el
  contenido de las secciones visibles (`extractSectionRelations`) → independiente del índice IA.
  Render con el **mismo estilo tenue** que las aristas de contenido pero **siempre visible**: en 3D
  (`BrainScene`) van en un `relationGroup` propio (no se ocultan con el toggle `showContentEdges`); en
  2D (`BrainCanvas`) un loop aparte siempre dibujado; `useForceLayout` las incluye como links de
  contenido. Endpoints resueltos a `s:<sectionId>` (o `n:<noteId>` si la nota colapsa/sección no
  existe). 100% renderer — sin IPC, sin cambios en `electron/`/`dist-electron/`.

### Grupos archivados
`NoteGroup.archived?` (en `groups.json`, vía `toggleGroupArchived` en `groupsStore`). Cuando
`showArchived` está off, el sidebar oculta el grupo **y sus notas** (el filtro de `baseNotes`
excluye notas cuyo `group` esté en `archivedGroupIds`, y el render salta el item del grupo); con
`showArchived` on, el grupo aparece atenuado y al final (`useSidebarGroups` ordena archivados
últimos). Las notas conservan su `archived` individual (no se cascada). Reusa el mismo toggle
"Show archived" que las notas. El campo es retrocompatible y lo sincroniza `groups:set`; el CLI lo
ignora. Sin IPC nuevo.

### Ventana frameless + hide-on-close
`frame: false`. Los controles de ventana son componentes React → IPC. La ventana principal se
oculta en lugar de cerrarse (`win.hide()`); la app vive en el system tray. Atajo global
`Ctrl+Shift+Space` la muestra/oculta.

### Ventana de Ajustes unificada (`src/components/Settings/`)
El ⚙ del TitleBar abre `SettingsModal` (overlay in-app, NO un BrowserWindow): split **nav
izquierda + panel derecho**, una sección por panel (un `.tsx` por panel en
`src/components/Settings/`). El orden canónico de la nav es el array `NAV` de `SettingsModal.tsx`
(icono + id; las labels salen del diccionario i18n por id) — no se duplica aquí. La **sección por
defecto es `general`** (la primera de la nav): el default vive en dos sitios y deben ir a la par —
la prop `initialSection` de `SettingsModal` y el `useState<SettingsSection>` del `TitleBar` (que es
quien la abre; la paleta de comandos solo cambia esa sección vía eventos).
Sustituyó al antiguo dropdown del titlebar y a los modales sueltos (eliminados);
`ExportImportModal` se conserva y se lanza desde el `DataPanel` por callback. Tamaño **fijo
proporcional** `w-[min(940px,92vw)] h-[min(680px,90vh)]`. Cada panel gestiona su propio
estado/efectos. El `CommandPalette` dispara los mismos eventos de siempre
(`noteflow:open-shortcuts/-startup/-github-sync/check-for-update/-export/-import`) y el TitleBar
los reinterpreta para abrir la ventana en la sección correcta (export/import siguen abriendo el
flujo `ExportImportModal` directo). Mismo bus para cualquier superficie **sin navegación propia**
que necesite llevar a Ajustes: el panel de IA del Cerebro emite `noteflow:open-account` para abrir
Ajustes → Cuenta (los paneles que ya viven dentro de Ajustes usan su prop `onNavigate`).

**Lenguaje visual compartido (`src/components/Settings/ui.tsx`) — úsalo en cualquier panel nuevo.**
Los 13 paneles repetían a mano el estilo de sus encabezados y botones, y la jerarquía se había
perdido (títulos casi invisibles en `text-text-muted/70`, botones "fantasma" que eran solo texto).
La fuente única de verdad ahora es:
- **`<SectionTitle>`** — encabezado de subsección: `text-[11px] font-mono font-semibold text-text
  uppercase tracking-widest` + **línea `border-b border-border` a todo el ancho** (se eligió el
  borde inferior sobre un chip con fondo: no compite con las tarjetas, que ya tienen fondo). Props:
  `children`, `icon?` (icono a la izquierda) y `action?` (slot a la derecha para acciones de la
  subsección, p. ej. los "Theme default" de Appearance).
- **`settingsButtonClass`** — cuerpo del botón **secundario** (el default): `bg-surface-2 border
  border-border text-text hover:bg-surface-3` + estados `disabled`. **No** incluye tamaño/padding/
  rounded: cada llamada mantiene los suyos. Los botones **primarios** (`border-text/20`, en Account/
  Cloud/Sync) y los **destructivos** (rojo) conservan su propio color — la distinción es intencional.
- **`settingsRaisedButtonClass`** — el mismo botón pero con `bg-surface-3`, para los que van **sobre
  una tarjeta `surface-2`** (las filas de Templates), donde un fill `surface-2` desaparecería.
Jerarquía resultante: título de la sección activa (`SettingsModal`, `text-sm font-semibold` + regla
inferior) → `SectionTitle` de cada subsección → etiqueta `text-text` + su hint a `mt-1` →
contenido. Los contenedores de panel van a `space-y-6`. Toggles/switches, swatches de color y
tarjetas seleccionables (tema/fuente/backend) **no** usan estas clases: tienen su propio lenguaje.
Todo en **tokens del tema** (`surface-*`, `border`, `text`, `text-muted`) — nunca colores
hardcodeados, o se rompe en alguno de los 14 temas.

### Single instance y activación de la ventana (Windows)
`app.requestSingleInstanceLock()` — una segunda instancia trae la existente al frente
(`second-instance` → `showWindow()`). Detalles no obvios, todos en `electron/main.ts`:

- El proceso que **pierde** el lock llama a `app.quit()`, pero eso no aborta el arranque: el callback
  de `app.whenReady()` empieza con un `if (!gotTheLock) return` para que ese proceso condenado no
  haga migración, pull inicial, tray ni ventana antes de morir.
- `app.setAppUserModelId('dev.noteflow.notes')` (solo Win, al principio de `whenReady`) debe coincidir
  con `build.appId` de electron-builder: agrupa el botón de la barra de tareas con el acceso directo
  anclado y atribuye bien las notificaciones.
- `showWindow()` hace, **solo en Windows**, un rebote de always-on-top (`setAlwaysOnTop(true)` →
  restaurar el valor previo → `moveTop()`) antes del `focus()`. Motivo: al pulsar el icono anclado con
  la app oculta en el tray, Windows lanza un segundo proceso que pasa a ser el de primer plano y
  bloquea `SetForegroundWindow` para nosotros; sin el rebote la ventana aparecía **detrás** y hacía
  falta un segundo click.

### Sync entre ventanas
Al escribir/borrar una nota, main hace broadcast (`notes-updated`) a todas las BrowserWindows.
El renderer filtra eventos de su propia ventana por `senderId`/`windowId` para evitar races.

### fs.watch de cambios externos
main observa el dir de notas con `fs.watch` (debounce 150ms) para detectar cambios del CLI o
de la sincronización desde otro dispositivo. Los writes propios se marcan en
`recentInternalWrites` para ignorarlos y evitar bucles.

### Recuperación de fallos del renderer
`render-process-gone` / `unresponsive` recargan la ventana automáticamente (común tras
suspender/reanudar). `powerMonitor.on('resume')` reemite `notes-updated` con delays escalonados
(1.5s…30s) por si el FS o el renderer tardan en recuperarse.

Complementariamente, un **React error boundary** (`src/components/ErrorBoundary.tsx`) envuelve como
componente más externo ambas ramas de `App.tsx` (principal y sticky). Una excepción de render que
antes desmontaba todo el árbol y dejaba la ventana en blanco (sin poder moverla ni cerrarla, al ser
frameless) ahora muestra un fallback a pantalla completa. Como las ventanas son frameless, el
fallback **incluye su propia barra arrastrable + minimizar/cerrar** (`window.noteflow.minimize()` /
`.close()`, mismo estilo que el `StickyTitleBar`) además de un botón "Reload"
(`window.location.reload()`); si no, volveríamos a una ventana inmanejable.

### Ventanas sticky (fold/unfold + shape)
Stickies = BrowserWindows extra que cargan la app con hash `#sticky?noteId=...&sectionId=...`,
`alwaysOnTop`. En Windows se usa `win.setShape()` (región redondeada calculada píxel a píxel)
porque el DWM ignora `border-radius` al perder foco. Plegado/desplegado animado en el main
(`fold-to-corner`/`unfold`) apilando las píldoras en la esquina.

**Transparencia dependiente de plataforma:** en **Linux/macOS** la ventana es `transparent: true`
(`backgroundColor: '#00000000'`) y el redondeo lo da el CSS. En **Windows** se crea **opaca**
(`transparent: false`, `backgroundColor: '#1e1e1e'`) a propósito: `transparent: true` dejó de
componerse bien tras las actualizaciones de Windows 11 (24H2/25H2) y la ventana quedaba casi
invisible; como en Windows el redondeo ya lo aporta `setShape()` (recorte de región DWM), la
transparencia era redundante y se desactiva. Ver el comentario en `createStickyWindow()`.


### Motor de alarmas y notas temporales (en main)
`setInterval` cada 60s ejecuta `checkAlarms()` + `checkExpiredNotes()`:
- **Alarmas:** el renderer recolecta deadlines/alarmas de los task items (`alarmUtils.ts`) y las
  envía con `alarms:schedule`; el main dispara `Notification` nativa cuando vence (incluye las ya
  vencidas/perdidas al registrar).
- **Notas temporales:** archivos con `expiresAt` vencido se borran del disco y del remoto.

### Auto-update in-app
`app:check-update` consulta la última release (API GitHub, endpoint `/releases/latest` → **ignora
prereleases**; compara con `latest !== current`, así que cualquier versión local distinta dispara
el update — útil para probar el flujo bajando a una versión inferior a la publicada). En Linux
elige el artefacto según la distro detectada: **Arch-based** (`/etc/arch-release`,
`/etc/cachyos-release` o `/usr/bin/pacman`) → `.pkg.tar.zst`; **Debian-based**
(`/etc/debian_version` o `/usr/bin/dpkg`) → `.deb`; resto → `.AppImage` (universal).
En **macOS** elige `NoteFlow-${latest}-arm64.dmg` (solo Apple Silicon).
`app:download-and-install` descarga el artefacto con una **allowlist estricta de hosts**
(github.com + objects/release-assets de githubusercontent.com) y de extensiones (`.exe`, `.deb`,
`.AppImage`, `.pkg.tar.zst`, `.dmg`), emite `update:download-progress` durante la descarga y
`update:installing` al terminarla (la UI muestra un spinner "Installing…" en el botón del
TitleBar), y luego instala **sin depender de popups del SO**:
- **Windows:** `spawn(setup, ['--updated','--force-run'], {detached:true}).unref()` + `app.quit()`
  (tras ~1s). **No usa `/S`**: así la **ventana de progreso nativa de NSIS sí se ve**. El flag
  `--updated` activa el `isUpdated` del macro `_CHECK_APP_RUNNING` de electron-builder, que **se
  salta el popup "cierra la aplicación"** y cierra la instancia él solo (el `MessageBox` solo
  aparece en instalación no-update); `--force-run` la relanza al terminar; al ser instalación
  **per-user** no hay UAC. **Clave:** el `app.quit()` explícito es imprescindible porque el cierre
  de ventana hace hide-to-tray (no sale) — sin él, el instalador tendría que force-killear la app
  tras un retry. Decisión de diseño: se eligió `--updated` (con barra de progreso) sobre `/S`
  (totalmente silencioso) para dar feedback visual de la instalación.
- **Linux deb/pacman:** `pkexec dpkg -i` / `pkexec pacman -U --noconfirm` (el diálogo de PolicyKit
  pidiendo root es esperado e inevitable: instalar a nivel de sistema requiere elevación), con
  fallback a `shell.openPath` si `pkexec` no está; al instalar hace `app.relaunch()` + `app.quit()`.
- **AppImage:** reemplazo en sitio — copia al dir de `$APPIMAGE`, `chmod +x`, **rename atómico**
  sobre el original (no sobreescribe el inodo en uso → no corrompe el proceso vivo) +
  `app.relaunch({execPath})` + `quit()`. Sin `$APPIMAGE` (dev/empaquetado raro) cae a `shell.openPath`.
- **macOS:** la build **no está notarizada**, así que no se usa Squirrel.Mac. Se hace
  `shell.openPath(dest)` para **abrir el `.dmg` en Finder** + una `Notification` "Drag NoteFlow to
  Applications"; el usuario arrastra a Applications y relanza a mano (la app NO sale). Reemplazo
  automático descartado por no poder probarse a ciegas.

> **Pendiente de verificar** en build empaquetado real (Win silent + AppImage in-place + **macOS dmg
> en Apple Silicon real**): probado de momento solo a nivel de compilación/typecheck. macOS, además,
> no se ha podido probar en runtime (sin Mac) — ver el bloque de soporte macOS más abajo.

`NOTEFLOW_NATIVE=1` (lo setea el wrapper
del PKGBUILD) hace que la app trate la instalación nativa de Arch como `isPackaged` para rutas de
iconos y modo no-dev.

### Soporte macOS (Apple Silicon) — añadido sin Mac para probar
Decisiones (tomadas por no disponer de Mac → mínima superficie de riesgo): **sin firmar/notarizar**
(firma ad-hoc vía `CSC_IDENTITY_AUTO_DISCOVERY=false` en CI), **solo arm64** (un `.dmg`), **update =
abrir el dmg en Finder** (no reemplazo automático). Qué cambió y qué NO:
- **NO cambió:** `app.getPath('userData')` (Keychain/Application Support ya correctos), `safeStorage`
  (Keychain con fallback), `fs.watch` recursivo (rama no-Linux), atajos globales/tray (`CommandOrControl`),
  `app.on('activate')→showWindow` (ya existía → reabrir desde el Dock funciona), notes dir (se mantiene
  `~/noteflow-notes` por **paridad con el CLI**), barra de título (`frame:false` → los semáforos nativos
  quedan ocultos y se usan los controles propios de la derecha, sin solapamiento).
- **Sí cambió:** bloque `mac` en electron-builder + `public/icon.icns`; ramas `darwin` en `app:check-update`
  y `app:download-and-install` (`main.ts`); `.dmg` en la allowlist de update; matrix `macos-14` + globs en
  el workflow; `preload.ts` expone `platform` y el renderer muestra `⌘`/`⌃` vía `src/lib/platform.ts`
  (`modKey`/`controlKey`/`keyLabel`); fix `Editor.tsx` Ctrl+Shift+B → acepta `metaKey`.
- **El único punto sin verificar es el runtime en un Mac real** (Gatekeeper + carga de módulos nativos
  desde `app.asar.unpacked` dentro del `.app` + arranque del worker de IA). Recomendado: publicar primero
  un tag prerelease (`-mac.1`) y que alguien lo pruebe antes del estable.

### CLI companion (`cli/noteflow.js`)
Node.js standalone (sin deps de Electron) que opera directamente sobre los `.md`. Comandos:
`add`, `new`, `list`, `get`, `read`, `set`, `path`, `touch`, `delete`, `rename`, `move`, `sections`,
`section add/rename/delete`, `favorite` (alias `pin`), `archive`, `groups`, `group create/delete`,
`folders`, `folder create/rename/delete`, `login`, `logout`, `push`, `pull`/`update`, `status`,
`cloud login/logout/status/setup/push/pull` (cliente NoteFlow Cloud headless — ver
`monetization.md` § 4 "Cliente CLI (headless)"; con sesión Cloud activa, `push`/`pull`/`status` y el
sync automático van a Cloud en vez de a GitHub), `migrate`, `self-update`.
Todo se direcciona **por nombre** (título de nota + nombre de sección), nunca por id; los nombres de
sección **no son únicos** → se desambiguan con un sufijo 1-based `#n` (p. ej. `Tasks#2`). La
resolución de sección (`matchSectionOrNull`) es única para todos los comandos: exacto → subcadena →
`#n`, y **falla ante ambigüedad en vez de adivinar** (`add` la usa igual que `set`, así un
`--section` parcial escribe en la sección existente en lugar de duplicarla). ⚠️ En `cmdAdd` eso vale
solo para el `--section` **explícito**: el default implícito `Note` se resuelve **exacto-o-crear**,
porque por subcadena un `noteflow add "texto"` a la nota diaria acabaría en una sección ajena
(`Meeting Notes`) o abortaría por ambigüedad sin escapatoria. Solo `read` y `path`
—de lectura— activan un último fallback **tolerante** (`fuzzySectionMatches`: sin acentos ni
mayúsculas, tokens y stopwords fuera, el candidato debe ser único), que avisa por **stderr** para no
ensuciar el stdout verbatim; los que escriben o destruyen (`add`/`set`, `section rename`/`delete`)
**no** lo usan. Pensado para
agentes de IA: **`read`** imprime contenido raw apto para pipe (vs `get`, decorado para humanos) y
**`set`** sobrescribe una sección (vs `add`, que solo añade al final). Como el CLI no tiene
find-replace, para **ediciones parciales** existe la vía sin round-trip: **`path`** imprime la ruta
absoluta del `.md` de una sección (o del dir de la nota) para que el agente lo edite con sus propias
herramientas, y **`touch`** cierra el ciclo — relee la nota de disco (obligatorio: `writeNoteFolder()`
reescribe cada `<secId>.md` desde `note.sections[].content`, así que una copia vieja pisaría la
edición), bumpea `updated:` y hace `syncPushNoteFiles` de `note.md` + todas las secciones. Detalle
completo en `cli/noteflow-cli/SKILL.md` (y skill `noteflow-cli`).

**Shims de Windows (`cli/noteflow.cmd`, `cli/noteflow.ps1`).** PowerShell prefiere el `.ps1` sobre el
`.cmd`, así que el `.ps1` carga con dos rarezas de PS 5.1: (1) en una **tubería** PowerShell se queda
con stdin y node vería EOF → el shim lanza node vía `ProcessStartInfo` y le escribe `$input` como
**bytes UTF-8** (`$input | & node` re-codifica y convierte los no-ASCII en `?`); redirige también
stdout/stderr y reemite stdout por el pipeline de PS (con un handle heredado, `$x = … | noteflow …`
y `> out.json` saldrían vacíos; el stderr de esa rama va a consola y no lo captura `2>&1`). (2) PS
5.1 decodifica la salida del hijo con la **codepage OEM** (`Consideración` → `Consideraci├│n`) → fija
`[Console]::OutputEncoding` a UTF-8 mientras dura la llamada y la restaura al salir. El `--json` ya
era inmune (escapa a `\uXXXX`); esto arregla el texto plano de `read`/`get`/`path`.
⚠️ `self-update` **solo** descarga `noteflow.js`, así que los shims viejos siguen instalados hasta
actualizar la app → `resolveSetContent()` detecta el caso "stdin vacío en win32" y explica la salida
(`--file`, `noteflow.cmd`, o actualizar).

**Auto-instalación de la skill.** Para que un agente (Claude Code) descubra la CLI sin descargar nada,
la app copia `cli/noteflow-cli/SKILL.md` a `~/.claude/skills/noteflow-cli/SKILL.md`. La carpeta
`cli/noteflow-cli` se bundlea vía `extraResources` (`package.json`) y en runtime `syncSkillToClaudeDir()`
(`electron/main.ts`) resuelve el origen: empaquetado → `process.resourcesPath/cli/noteflow-cli/SKILL.md`,
dev → `__dirname/../cli/noteflow-cli/SKILL.md` (`__dirname` = `dist-electron/`). Se ejecuta en cada
arranque (fire-and-forget, best-effort con try/catch): copia solo si el contenido difiere (auto-cura y
recoge updates sin reescribir en vano). Controlado por el setting local `exposeSkillToAgents` (default
`true`) en `settings.json`; al desactivarlo borra el fichero y la carpeta `noteflow-cli` si queda vacía
(nunca toca nada más de `~/.claude`). Toggle **"Expose CLI skill to AI agents"** en Settings → AI
(sección "AI agents"), IPC `app:get-skill-sync` / `app:set-skill-sync`.

## Temas

14 temas en `src/lib/themes.ts` (cada uno = set de CSS vars). Default: `noteflow-dark`.
Los temas de marca **NoteFlow Dark** (default) y **NoteFlow Light** espejan los colores de la
landing real ("The Brain" design system, `docs/src/styles/brain-site.css` — NO el `tokens.css`
sin usar): superficies casi negras cálidas (`#0c0c11`) / pergamino (`#E7DFCC`), tinta blanco-cálida
(`#ECEAE0`) y el acento ámbar firma `--detail` (`#f5a623`, hover/realces de la web) + teal/verde/
púrpura/cyan/rosa/rojo de la web. Ambos usan la fuente Space Grotesk. Resto —
Dark: Tokyo Night, Midnight Blue, Carbon, VS Code Dark, Dracula, True Godot, GruvBox Dark,
Obsidian, Emerald Forest, Synthwave. Light: Arctic Day, Parchment. El tema se persiste en
`settings.json` (`theme`) y se lee de forma síncrona al arrancar (`settings:get-theme`); usuarios
existentes conservan el suyo, los nuevos arrancan en `noteflow-dark`.

**⚠️ Gotcha de la paleta Tailwind:** `tailwind.config.js` **redefine** las claves `red`, `cyan`,
`purple` (y `accent*`, `text*`, `surface*`, `border`) como color plano ligado a la CSS var del tema.
Al ser un string, la clave **sustituye** a la paleta por tonos de Tailwind → **`text-red-400`,
`bg-red-500/10`, `border-red-500/30` y demás variantes numeradas de `red`/`cyan`/`purple` NO generan
CSS** (clases muertas: el texto hereda color y el `border` se queda con el gris por defecto). Lo
correcto es `text-red` / `bg-red/10` / `border-red/50` (opacidad con `/`), que además sigue al tema
activo. Las paletas que el config **no** toca (`green-400`, `amber-500`…) sí funcionan. Hay usos
antiguos de `red-400`/`red-500` por el código que son no-ops — al tocar un componente, migrarlos.

Animaciones propias del config: `animate-shake` (nudge horizontal de 0,28 s para un input que acaba
de rechazar un valor, p. ej. el código de sign-in en Ajustes → Cuenta; úsalo con `motion-safe:`).

### Colores del editor (overrides sobre el tema)

Además del acento y la fuente de la app, Ajustes → Apariencia permite repintar **6 colores del
editor** por encima del tema activo (`editorColors` en `src/stores/themeStore.ts`):

| Key (`EditorColorKey`) | CSS var | Fallback del tema | Qué pinta |
|---|---|---|---|
| `h1` / `h2` / `h3` | `--heading-1/2/3` | `--accent` / `--cyan` / `--text` | Encabezados |
| `italic` | `--em-color` | `--purple` | Cursiva (`em`) |
| `inlineCode` | `--code-inline` | `--red` | Código inline (`code`, no el `pre code`) |
| `codeAccent` | `--code-accent` | `--accent` | Borde izquierdo **compartido** de `pre` y `blockquote` |

Mecánica (la misma para los 6): el override se guarda como triplete `"r g b"` o `null` = seguir el
tema; se aplica con `setProperty`/`removeProperty` sobre `document.documentElement` y el CSS usa el
fallback nativo (`color: rgb(var(--code-inline, var(--red)))` en `src/index.css`), así que sin
override el color sigue vivo al cambiar de tema. Persistencia en `localStorage` bajo la clave
**`noteflow-heading-overrides`** — nombre heredado de cuando solo había H1/H2/H3: se mantiene (en vez
de migrar a otra clave) porque el parser tolera claves ausentes → `null`, y así los usuarios que ya
habían personalizado sus encabezados no pierden nada. La clave se borra cuando los 6 vuelven a `null`.

### Color de grupos y secciones (paleta del tema + color libre)

Un color de grupo/sección (`GroupColor` en `src/types/index.ts`) es **una de las 8 CSS vars del tema**
(`ThemeColorVar` = `TAG_COLOR_VARS` en `src/lib/tagColors.ts`) **o un hex libre** `CustomColor`
(`'#rrggbb'` en minúsculas). Los pickers (menú contextual de sección, barra de color del editor, menú
del grupo en el sidebar, punto de color de la Group Overview) muestran los 8 presets + el botón *auto*
(solo secciones) + un **swatch de color libre** (`src/components/CustomColorSwatch.tsx`), mismo patrón
que Ajustes → Apariencia: círculo con degradado cónico y un `<input type="color">` transparente encima
que abre el selector del SO.

Reglas al pintar: **nunca** interpolar `rgb(var(${color}))` — un hex rompería esa forma. Usar
`colorChannels(color)` (devuelve `var(--accent)` o `"122 162 247"`), que funciona igual con y sin
alpha: `rgb(${colorChannels(c)})`, `rgb(${colorChannels(c)} / 0.2)`. Para el canvas/three de la vista
cerebro, `readColor()` en `src/components/Brain/brainColors.ts` parsea el hex directamente (el
`getComputedStyle` de una var no resolvería un hex y caería al gris). Las conversiones hex ↔ triplete
`"r g b"` viven en `src/lib/colorUtils.ts` (compartidas con `AppearancePanel`).

Validación: `normalizeGroupColor()` (var conocida, o hex normalizado a minúsculas, `#rgb` expandido, o
`null`) en `src/lib/tagColors.ts`, con **espejos** en `electron/main.ts` (`sanitizeSectionColors`, para
`section-colors.json`) y en `electron/ai/llm/tools.ts` (`create_group` del agente, que ya generaba
colores hex). `groups.json` no se valida en main: el color llega tal cual desde el renderer.

El swatch libre **debounce ~250 ms** la persistencia (con flush en `blur`/desmontaje) porque React mapea
el `onChange` del `<input type="color">` al evento `input`, que dispara en cada frame del arrastre y
cada commit escribe a disco + programa un push de sync.

**Compatibilidad:** un hex en `section-colors.json`/`groups.json` es descartado por versiones antiguas
de la app y por NoteFlow Mobile (validan contra las 8 vars) → esas notas/grupos se ven con el color
automático allí. Aceptado a propósito; el formato de los ficheros no cambia.

### UI text size (zoom global) y posicionamiento de popups `fixed`

El "UI text size" (Settings → Appearance) escala toda la UI aplicando un CSS `zoom` sobre
`document.documentElement` (`applyUiScale` en `src/stores/themeStore.ts`; pasos en `UI_SCALES`).
**Gotcha:** bajo el `zoom` del root, un elemento `position: fixed` vive en el espacio de
coordenadas *zoomeado* (local, el mismo que `window.innerWidth/innerHeight` y que las coords de
ratón `clientX/clientY`), mientras que `getBoundingClientRect()` devuelve coords en espacio de
*dispositivo* (multiplicadas por el zoom). Por eso un popup fixed posicionado a partir de un rect
cae más abajo/desplazado cuanto mayor es el zoom.

**Regla:** cualquier popup `position: fixed` que se posicione desde `getBoundingClientRect()` debe
dividir las coords del rect (`rect.left/top/bottom`) por el factor de zoom antes de clampear contra
`window.inner*` y de escribir `style.left/top`. Usa el helper `getRootZoom()` (exportado desde
`themeStore.ts`, única fuente de verdad) — con zoom 1 es no-op. `offsetWidth/offsetHeight` del popup
ya están en espacio local, no se tocan. Ejemplos aplicados: menú slash (`SlashCommands.ts`,
`positionPopup`) y los popovers de fecha/importancia de tareas (`DeadlineTaskItemView.tsx`,
`openPopover`/`openImpPopover`). Los menús posicionados desde coords de ratón (`ContextMenu`, menús
de sidebar) o submenús `absolute` dentro de un menú ya zoomeado (`NoteContextMenu`) NO necesitan el
ajuste.

**Pendiente (scroll bajo zoom):** con `zoom` en el root y contenedores de scroll anidados
(`flex-1 overflow-y-auto` del editor), a zoom alto el fondo del contenido puede quedar inalcanzable
por el scroll. NO se arregla contra-escalando la altura del root (`calc(100% / scale)` deja una
franja vacía por debajo — se probó y se revirtió). La solución de fondo es dejar de usar CSS `zoom`
en el root y escalar la UI con la API nativa de Electron (`webFrame.setZoomFactor`), que maneja
viewport y scroll correctamente.
