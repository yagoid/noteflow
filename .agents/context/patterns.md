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
- **Mini-vista del sidebar flotante:** sus filas se derivan en `Sidebar` (un `useMemo` más sobre
  `items`, solo mientras flota) y `SidebarShell` las guarda **solo si cambia su firma**
  (`miniRowsSignature`): teclear en el editor no cambia ids/orden/colores → la mini-vista no se
  re-renderiza. Solo se pinta la ventana visible (ver "Sidebar flotante").
- **Peek de grupo colapsado:** su estado vive en `GroupPeek`, no en `Sidebar`; las cabeceras reciben
  handlers estables y el hover no re-renderiza la lista (ver "Peek de grupo colapsado").
- **Item de nota (mapa plegado):** el despliegue al hover es estado local de `NoteSectionMap`, la sección
  abierta solo llega a la fila activa, la medida del tope de 2 filas solo existe en ella
  (`OpenSectionMap`) y el FLIP entre filas no cuesta nada sin cambio de nota activa (ver
  "Sidebar: item de nota").
- **Grupos y carpetas (guías, cursor):** nada de eso re-renderiza la lista. El cursor y la marca de
  plegado los mueve `GroupGuides` (montado una vez, imperativo, con `ResizeObserver`/`MutationObserver` coalescidos a un
  rAF); a `NoteRow` solo le llegan primitivas nuevas (`staggerIndex` capado, y en favoritas
  `groupColor`/`groupName`). Solo el arrastre de nota (estado `noteMoveTarget`, ya existente)
  re-renderiza al cambiar de destino (ver "Sidebar: grupos y carpetas").

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
- **Decisiones de UX:** contenido importado en **modo markdown** (`isRawMode:false`, renderizado); **notas sin
  contenido se omiten** (filtradas en preview por `externalContent()`); los **grupos/folders se crean
  solo al confirmar** (previsualizar y cancelar no deja rastro). Nesting >2 niveles se aplana a
  grupo + folder (`'A / B'`). Tutorial in-app por fuente en el selector de origen.
- **Sync:** `notes:write-imported` sube las notas con `pushPathsNow` (push durable awaited por lotes)
  en vez de `schedulePush` por archivo, para que un pull de auto-sync no las borre a mitad del import
  (ver "GitHub Sync" → Push).
- **Smokes:** `scripts/import-notion-smoke.cjs` (node, lado main: hex/wrappers/relPath) y
  `scripts/import-notion-verify.cjs` (e2e: corre la conversión REAL del renderer en una ventana
  oculta de Electron + esbuild, escribe a un dir temporal; valida 0 pérdida de contenido).

### Vista de contenido unificada (`ContentView/`, `lib/contentView.ts`)
Sustituye a la antigua vista de grupo (`GroupOverview`) y a "All content" (`AllContentOverview`), y con
ellas a `OverviewNoteCard` (borrados). Una sola vista full-area con cabecera y tres columnas: **lugares**
(`PlacesRail`), **notas** (`NoteTimeline`; por fecha o como en el sidebar) y **vista previa** (`SectionPreviewPane`), montadas por
`ContentView.tsx`; estilos `.cv-*` al final de `index.css`. Lógica pura en `src/lib/contentView.ts` con
tests en `tests/lib/contentView.test.ts`. Sin IPC nuevo.
- **Estado (`notesStore`):** `contentPlace: ContentPlace | null` (null = cerrada) + `setContentView(place)`,
  que también cambia de lugar con la vista abierta. `ContentPlace` es un string tipado: `'all' | 'fav' |
  'none' | 'g:<groupId>' | 'f:<folderId>'` (helpers `groupPlace`/`folderPlace`/`parsePlace`). Sustituye a
  `groupViewId`/`setGroupView` y `allViewOpen`/`setAllView`; `openGroupFromAll`/`openNoteFromAll`
  desaparecen y `cameFromAllView` pasa a `contentReturnPlace` (ver "Vista de nota"). `filterDate` (el
  filtro de fecha que vivía en "All content") se eliminó del store: los bloques por fecha hacen ese papel.
- **Entradas:** botón `LayoutGrid` del sidebar → `'all'`; nombre del grupo en el sidebar
  (`NoteGroupHeader.onOpenGroupView`), "View group" del menú del grupo y clic en un grupo del cerebro
  (`BrainView.openGroup`) → `groupPlace(id)`. `App.tsx` la monta **sin `key`** (al revés que la vista de
  nota): cambiar de lugar conserva la nota elegida si sigue en la lista. Es la primera en la prioridad
  de routing (contenido → cerebro → nota → editor).
- **Lugares y filtrado:** `noteLocation` resuelve grupo/carpeta efectivos con la misma guarda que
  `useSidebarGroups` (grupo inexistente → sin grupo; carpeta de otro grupo → raíz). `noteShown` aplica
  el toggle local **"Show archived"** (menú ⋯ de la cabecera, apagado al abrir; ya no se usa el
  `showArchived` del sidebar): sin él se ocultan las notas archivadas y las de grupos archivados, salvo
  las del grupo archivado en el que está la vista (para que abrirlo desde el cerebro no salga vacío).
  `noteInPlace` filtra por lugar. Los contadores de la columna 1 salen del conjunto mostrado (sin la
  búsqueda). Si el grupo/carpeta del lugar desaparece (borrado o sync) → `'all'` (`placeExists`).
- **Anchos de columna (tiradores):** `ColumnHandle` (en `ContentView.tsx`, `role=separator`) entre lugares y
  notas y entre notas y vista previa (este solo con la vista previa visible); aspecto del tirador del sidebar
  (`w-1 cursor-col-resize hover:bg-text/30`) y `.cv-rsz` lo centra sobre el borde sin ocupar sitio (margen
  −2 px). Estado `columnWidths: { rail, preview | null }` persistido en `localStorage`
  **`noteflow:content-view-widths`** (JSON; lectura y escritura en try/catch; `parseColumnWidths` valida y
  recorta). Límites en `COLUMN_LIMITS` (`lib/contentView.ts`, con tests): lugares 180–360 (260 por defecto),
  vista previa 280–1200 y ≤ 70 % de la vista (en pantalla completa el tope real suele ser dejar 320 a la
  lista), lista 320. `preview: null` = el ancho responsive de siempre
  (`clamp(300px, 34cqw, 440px)`). Los anchos guardados llegan como `--cv-rail-w` / `--cv-pv-w` inline en
  `.cv-body` y **el CSS pinta con los mismos topes que los clamps de JS** (sin `ResizeObserver`):
  - `--cv-rail-real = clamp(180px, rail, 100cqw − 320px − suelo de la vista previa − reserva) + reserva`. La
    reserva (`--cv-rail-extra`) es la de la mini-vista del sidebar flotante (`.sidebar-floating .cv-body`); el
    suelo de la vista previa (`--cv-pv-floor = min(280px, 50cqw)`) solo cuenta con `.cv-body.has-preview`.
  - `--cv-pv-real = min(ancho, 70cqw, max(min(280px, 50cqw), 100cqw − rail real − 320px))` (suelo:
    `previewFloor`, con `previewFloorShare` 0,5; techo: `previewMaxShare` 0,7 y `previewMax` 1200).
  - Resultado: la lista conserva 320 px; si falta sitio cede **primero la vista previa** hasta su suelo y
    **después la columna de lugares** hasta 180; por debajo de eso (p. ej. ventana mínima con sidebar ancho)
    solo encoge la lista. El 50 % gana al mínimo de 280: en una vista de menos de 560 px la vista previa se
    pinta a la mitad (y ahí su tirador no tiene recorrido). Lo guardado no se toca al estrechar la ventana:
    al volver a ensancharla cada columna recupera su ancho.
  Arrastre: se mide al empezar el ancho del `.cv-body`, el **ancho pintado** de la columna (punto de partida,
  así no salta) y la reserva (`padding-left` del rail − `railPadding`); se clampa con `clampRailWidth` /
  `clampPreviewWidth` (misma aritmética que el CSS, `previewFloor`). Cada movimiento escribe la variable CSS
  **directamente en el DOM** (sin re-render) y al soltar se guarda en estado + `localStorage` (un clic sin
  mover no guarda nada, para que el primer clic del doble clic no fije el ancho; soltar fuera de la ventana
  termina el arrastre por `buttons === 0`). Mientras se arrastra, `.cv-body.is-resizing` quita la transición
  de `width` de `.cv-pv` (la animación es solo de abrir/cerrar). Doble clic → ancho por defecto.
- **Columna 1:** All, Favorites, "Places", cada grupo (pestaña `.sbg-tab` del sidebar + contador) con
  sus carpetas (`FolderGlyph`) bajo una guía vertical del color (`.cv-rg::before`, como
  `.sbg-in::before`) que baja hasta "+ Folder" (o su input), también en un grupo sin carpetas. Luego "+ Group" y Ungrouped. Grupos
  archivados al final y atenuados (solo con el toggle o si son el lugar). Lugar elegido = fondo neutro + barra
  de 3 px del color (`::before`). "+ Folder" / "+ Group" van más apagados que los nombres de carpeta
  (`.cv-ri.cv-add`: `text-muted` al 45 %, `text` al hover; el selector de dos clases es necesario para ganar
  a `.cv-ri.is-folder`). **Edición inline (`InlineName`)**: estado `railEdit` de `ContentView` (`RailEdit`:
  add-folder / add-group / rename-group / rename-folder; vive en la vista porque los menús contextuales también
  la abren). "+ Folder" / "+ Group": Enter o blur con texto crea (`createFolder` / `createGroup(name,
  NEW_GROUP_COLOR)` — constante de `lib/tagColors.ts` que usa también el "+ grupo" del sidebar, `'--accent'`)
  y selecciona el lugar nuevo; Esc o blur vacío cancela; un `doneRef` evita el doble alta por el blur tardío.
  Rename: el mismo input en el sitio del nombre, con el nombre seleccionado; guarda solo si cambia.
- **Menús contextuales de grupo y carpeta (compartidos con el sidebar):** `components/GroupContextMenu.tsx` y
  `components/FolderContextMenu.tsx` (clases en `components/contextMenuStyles.ts`), extraídos del `Sidebar`
  y usados en los dos sitios con las mismas acciones. Patrón de `NoteContextMenu`: siempre montados con
  `request | null`, se cierran con clic fuera o Esc, y el `ConfirmModal` de borrar vive en el componente (sobrevive
  al cierre del menú). Grupo: View group (prop opcional `onOpenGroupView`; la columna 1 no la pasa porque ya
  está en la vista), new note, new folder, rename, color (8 del tema + `CustomColorSwatch`), archive y delete
  (quita el grupo de sus notas y `deleteGroup`). Carpeta: new note, rename y delete. Las acciones que dependen
  de la lista (new folder, rename) son callbacks: el sidebar abre sus inputs y la vista, `railEdit`. Borrar el
  grupo o la carpeta que es el lugar actual cae a `'all'` por el efecto de `placeExists`. El snapshot del Esc
  cuenta también estos menús.
  Grupos, carpetas y Ungrouped son destino de soltar (`placeMovePatch` → `updateNote({group, folder})`,
  no-op con `alreadyInPlace`); aceptan también notas arrastradas desde el sidebar (`application/x-noteflow-note-id`).
  Con el sidebar flotante la columna reserva `--mini-sidebar-reserve` a la izquierda (mini-vista).
- **Orden de la columna 2 (`ContentSort`: `'date'` | `'sidebar'`):** control segmentado `.cv-seg` en la
  cabecera, en `.cv-tools` entre el buscador y "+ Note" (`role=radiogroup`, "By date" / "As in the sidebar").
  Persistido en `localStorage` **`noteflow:content-view-sort`** (try/catch; `parseContentSort`, por defecto
  `'date'`). `buildNoteList(listadas, {sort, place, groups, folders, noteOrder, now})` devuelve las secciones
  (`NoteListSection`: `heading` | null, `items`, `folders` = subsecciones, `count`, `route`) y
  `noteListOrder` las aplana: **ese orden plano** alimenta ↑/↓, el rango de Shift+clic, Ctrl/Cmd+A y la
  selección por defecto (`reconcileSelection`). Las búsquedas filtran antes (`listed`), así que una cabecera
  sin notas visibles no se pinta.
  - **"As in the sidebar" reutiliza el modelo del sidebar**, no lo reimplementa: `lib/sidebarGroups.ts`
    (`buildSidebarItems`, extraído de `useSidebarGroups`, que ahora es solo su `useMemo`; lo usan el sidebar,
    el cerebro y esta vista) sobre el orden base del sidebar `compareSidebarNotes` (`created` desc, el mismo
    `.sort` de `Sidebar.tsx`) con el orden manual `noteOrder` de `groupsStore` (`group:<id>`,
    `folder:<id>`, `ungrouped`); favoritas con `orderFavorites` (`lib/miniSidebar.ts`, clave `favorites`).
    Por lugar: **grupo** → sueltas sin cabecera (ruta `folder`: "In the group") y luego cada carpeta con
    cabecera (icono + nombre + contador; ruta `none`), como el sidebar (sueltas antes que carpetas);
    **carpeta / favoritas / sin grupo** → una sección sin cabecera con la ruta de `routeMode`; **todo** → una
    sección por grupo (cabecera `.cv-bh.is-group`: pestaña `.sbg-tab` del color + nombre + contador, icono de
    archivo si está archivado; los archivados al final y solo con "Show archived", porque `noteShown` ya
    deja fuera sus notas) con sus carpetas como subcabeceras `.cv-bh.is-sub` (más pequeñas, sangradas y
    sticky justo debajo: la del grupo mide 34 px fijos y la sub va en `top: 34px`; `.cv-sub .cv-row` sube el
    `scroll-margin-top`), y al final "Ungrouped" (con cabecera solo si hay algún grupo encima, como la
    etiqueta "notes" del sidebar). En "todo" las filas no repiten grupo ni carpeta (ruta `none`). Todo no
    lista las favoritas aparte (no se duplican filas).
  - **Columna de la hora** en este modo: `timeKind: 'relative'` → `formatNoteDate` (`Sidebar/rowText`, la
    fecha del item del sidebar: `HH:mm` hoy, "Yesterday", `MMM d`), y `.cv-list.is-sort-sidebar` ensancha
    la columna a 62 px para que quepa "Yesterday". Como en el sidebar, esa etiqueta no se refresca sola al
    cambiar de día (la fila es `memo`).
  - Al cambiar de orden la nota elegida se mantiene y se trae a la vista (`scrollIntoView nearest`).
- **Columna 2:** por fecha, notas por `updated` desc (`sortByUpdatedDesc`) en bloques `dateBlock`: today, yesterday,
  week (el resto de los últimos 7 días naturales: desde las 00:00 de hace 6 días), month
  (últimos 30 días desde ahora) y older; aritmética de calendario (DST) y una hora futura (reloj de otro
  dispositivo) cuenta como hoy. Cabecera de bloque sticky con contador. `now` es estado que solo cambia
  cuando cambia el día (intervalo de 60 s), así las filas no se re-renderizan cada minuto. Fila = grid
  `50px | 1fr | minmax(70px,140px)`: hora (`timeLabelKind`: HH:mm hoy y ayer, `EEE` esta semana,
  `d MMM` antes; formateada **en la fila** con `formatDate` para seguir el idioma), título (+ candado,
  + icono de archivo si archivada), ruta según `routeMode` (full / folder / none: se omite lo que dice el
  lugar) y la línea de segmentos (`.nsm-spine`/`.nsm-seg` + `sectionLineWeights`) **decorativa**: la fila
  no lleva `data-note-row`, así que no engorda al hover ni despliega. **Secciones siempre visibles:** un
  `.nsm-map.cv-map` (de la columna del título al final) con `SectionCell` (`focusable={false}`), la elegida
  `active` con la tinta de `useSectionInk`; con búsqueda, `sectionSearchMatch` tiñe las que coinciden y atenúa
  el resto. El hover preview de `SectionCell` se mantiene. `TimelineRow` es `memo` con props planas (nota +
  primitivas: la vista rehace sus entradas cuando cambia la lista) y handlers por fachada estable (ref en
  `useLayoutEffect`, como `Sidebar.rowHandlers`). `--nsm-ease` se define en `.cv-root` (las transiciones de
  `.nsm-cell` lo necesitan y aquí no hay `.nsm`).
- **Selección (una nota + sección):** estado `selection`, pero lo que se pinta es `reconcileSelection(lista,
  selection)` (derivado, sin effect): se mantiene la nota si sigue listada (la sección si existe, si no la
  primera) y si no, la primera nota con su primera sección. Al abrir no hay selección → la primera de la
  lista con la vista previa abierta. Al cambiar de lugar se ajusta en render (patrón `prevPlace`) y se
  limpian la multiselección y el menú. Fila elegida = fondo neutro 7 % + barra de 3 px del color del grupo,
  **solo con la vista previa abierta** (como el prototipo). Clic en celda → esa sección; clic en la fila →
  primera sección (repetir sobre la elegida no cambia la sección); doble clic / Enter → editor; clic
  derecho → `NoteContextMenu` de nota o de sección. Los clics devuelven el foco a la lista
  (`tabIndex=0`, `role=listbox`) para que las flechas sigan funcionando.
- **Multiselección:** `checkedIds` local; la casilla sustituye a la hora al hover y queda visible mientras
  haya selección (`.cv-list.is-selecting`). Ctrl/Cmd+clic alterna, Shift+clic marca el rango visible
  (`selectionRange` desde el ancla = la última alternada o la nota elegida), Ctrl/Cmd+A alterna todas las
  listadas (guarda de INPUT/TEXTAREA/contentEditable, sin Alt/Shift); con selección, el clic normal
  alterna. Las acciones solo actúan sobre las **marcadas que siguen listadas** (`checkedNotes`: una búsqueda
  que estrecha la lista no toca notas ocultas). Barra al pie de la columna 2: `components/SelectionBar.tsx`
  (la de la antigua vista de grupo, ahora compartida; "Move to folder" solo si el lugar es un grupo o una
  carpeta) con las mismas acciones (favorite/archive como toggle, move to group/folder, delete con
  `ConfirmModal`) y sus claves i18n de `overview.*`. Arrastrar una fila marcada arrastra todas las marcadas
  (`dragIdsRef`); la opacidad del arrastre se pone en el siguiente frame (si no, también la coge la imagen
  del drag). Red de seguridad `dragend`/`drop` en `window` (la fila de origen puede desmontarse al moverse).
  El root hace `stopPropagation` de `dragover`/`drop` para que un drop fallido no llegue al "soltar en el
  editor → split" de `<main>`; `App` tampoco pinta su overlay de drop con la vista abierta.
- **Columna 3:** ancho `--cv-pv-real` (ver "Anchos de columna"; por defecto `clamp(300px, 34cqw, 440px)`,
  `.cv-body` es `container-type: inline-size`), que pasa a 0 al cerrar con transición de `width`; el interior
  (`.cv-pv-in`, mismo `--cv-pv-real`) mantiene su ancho y se desvanece. Ruta + nombre con
  cuadradito de color + `Section n of m · stats · edited …` (`sectionCardStats`, `formatNoteDate`) + el
  contenido real: `htmlFromMarkdown(clipPreviewMarkdown(md, 40 000))` dentro de `.note-preview >
  .prose-editor > .ProseMirror` con `--prose-font-family = proseFontStack(...)` (como la vista de nota); raw →
  `<pre>` tal cual; cifrada bloqueada → el aviso de la vista de nota (`overview.noteEncrypted`). Solo se
  renderiza el markdown de esta sección (memo por contenido). "Open in the editor" usa el baile
  `pendingInitialSectionId` + `noteflow:request-section` diferido (`setTimeout(0)`) tras `setOpenNoteIds([id])`
  + `setActiveNote(id)`. La X la cierra (`previewOpen=false`) y **no** se reabre al cambiar de lugar ni con la
  lista; sí al elegir nota o sección (clic o flechas).
- **Teclado:** en la lista (`onKeyDown`), ↑/↓ nota (`stepNote`, conserva la sección si es la misma nota), ←/→
  sección (`stepSection`), Enter abre (con la vista previa visible); las flechas hacen `scrollIntoView
  ({block:'nearest'})` de la fila (`scroll-margin-top` libra la cabecera sticky). `Esc` (listener de `window`
  en burbuja): menú ⋯ → multiselección → vista previa → cerrar la vista. No actúa con un menú contextual o
  un modal abiertos al empezar la pulsación (snapshot en captura, igual que la vista de nota), con el
  `ConfirmModal` propio ni en campos `data-own-keys` (los inputs inline paran su Esc). En el buscador, el
  primer Esc lo vacía y ↓ baja a la lista. La lista recibe el foco al abrir.
- **Animaciones:** entrada de cabecera/cuerpo, tarjeta de la vista previa y menú con `animation-fill-mode:
  backwards` (nunca `both`/`forwards`: un `transform` que se queda aplicado haría del contenedor el
  *containing block* de los `fixed`). Todo se apaga con `prefers-reduced-motion`.
- `.cv-body` es el **ancla de contenido** del sidebar flotante (`data-sidebar-anchor` + `sidebarAnchorRef`).

### Vista de nota (note overview)
`notesStore` tiene `noteViewId: string | null` + `setNoteView(id)`. Es una de las **vistas full-area
mutuamente excluyentes** (contenido / nota / cerebro): los setters (`setContentView`, `setNoteView`,
`setBrainView`) y `setActiveNote` se limpian entre sí, así que abrir una cierra las otras y seleccionar una
nota devuelve el editor. `App.tsx` la renderiza (`NoteOverview`) con la prioridad de routing (contenido →
cerebro → nota → editor) y `onClose = closeFullView()`. **Back inteligente:** si `setNoteView` se llama con la
vista de contenido abierta (menú de sección → "Note overview"), guarda su lugar en `contentReturnPlace` (y lo
conserva si se salta a la vista de otra nota); `closeFullView()` vuelve entonces a la vista de contenido en
ese lugar, y si no, al editor. Crear/seleccionar una nota, abrir el cerebro o la vista de contenido lo limpian. **Entradas:** el botón `LayoutGrid` de las acciones del mapa de
secciones de `NoteEditor` (junto a la estrella) y el ítem "Note overview" del menú contextual **de sección**
(tag de sección en sidebar/vistas o tab del editor; el menú de la nota en sí no lo ofrece). El clic en la
fila de la nota en el sidebar **no** es una entrada: abre el editor en la primera sección. Sin IPC nuevo.

**Es el mapa de secciones con la vista previa dentro** (`NoteOverview/NoteOverview.tsx`, lógica pura en
`src/lib/noteOverviewGrid.ts` con test en `tests/lib/noteOverviewGrid.test.ts`, estilos `.note-grid*` en
`index.css`). Las previsualizaciones de sección (hover y cerebro) usan `SectionHoverCard`, una celda de
esta vista en tarjeta flotante — ver abajo (el antiguo mini-mock con `zoom`, `SectionPreviewCard`, se eliminó).
Decisiones a respetar si se toca:
- **Un bloque reticulado**, como el mapa: juntas de 4 px sobre `--bg-editor`, radio 8 px fuera
  (`overflow: hidden` en `.note-grid`) y 4 px en las celdas, fondo `--text / 0.06` (hover 0.09, sin bordes
  ni sombras). Las tarjetas van en el **orden de las pestañas**.
- **Filas explícitas, no `flex-wrap`:** `planNoteGrid(ids, openId, columns, wideIds?)` reparte en filas de
  `columns` unidades; cada slot es `flex: <unidades> 1 0px` (filas justificadas, alto fijo 196 px). La
  sección **abierta en el editor** cuenta 2 unidades (solo si hay > 2 columnas). Una sección que no cabe
  cierra la fila antes (sus celdas se estiran). El hueco final de la última fila es la celda **"New
  section"** (añade una sección y la abre en el editor) si mide ≥ 1 unidad; si no (fila llena o a media
  unidad de estarlo, o no hay secciones) va en una **franja de 40 px** propia.
- **Mosaico: tarjetas anchas por contenido.** No todas las tarjetas son el cuadrado base: una sección con
  contenido largo cuenta **1,5 unidades** (`NOTE_GRID_WIDE_SPAN`, solo si hay > 2 columnas), un rectángulo
  intermedio entre el cuadrado y la abierta. La regla es `sectionCardIsWide(md)`: ≥ 12 líneas de preview
  (`WIDE_CARD_MIN_LINES`; las líneas en blanco no cuentan y una línea larga cuenta lo que ocuparía
  partida a ~36 caracteres, `PREVIEW_LINE_CHARS`) — determinista y derivada del contenido, con el umbral
  bien por encima de las ~8 líneas que enseña un cuadrado para que rara vez salte al teclear (no hay histéresis: cruzar el umbral sí la cambia). `NoteOverview`
  pasa los ids anchos a `planNoteGrid(ids, openId, columns, wideIds)` vía una clave memoizada (el plan solo
  cambia cuando una sección cruza el umbral). **Ancha es una preferencia, nunca deja huecos:** si una ancha
  solo cabe como cuadrado entra como cuadrado, y las anchas de una fila vuelven a cuadrado (desde el final,
  las justas) si así cabe la abierta. Por eso una fila con anchas queda como mucho a media unidad de
  llenarse, lo que garantiza que **una ancha siempre es más estrecha que la abierta** aunque la fila se
  estire (hay un test de propiedad). La abierta sigue en 2 unidades aunque sea larga. Solo varía el ancho:
  el alto de fila es fijo (tarjetas más altas exigirían abandonar las filas explícitas, de las que dependen
  las juntas de drop y el foco por flechas).
- **Remontado:** las celdas pueden remontarse al cambiar de fila (reordenar, redimensionar, o una sección
  que cruza el umbral de ancha): aquí da igual porque la sección abierta no cambia mientras la vista está abierta (abrir
  otra cierra la vista), al contrario que en el mapa del editor.
- **Columnas adaptativas:** `gridColumnCount(ancho)` = tantas de ≥ 220 px como quepan (mín. 1), medido con
  un `ResizeObserver` sobre el contenedor en un `useLayoutEffect` (sin parpadeo).
- **"Abierta"** = la sección que el editor tiene en un pane de esta nota (`primaryPaneForNote` →
  `pane.sectionId`, si no `activeSectionByNote`, si no la primera). Si ningún pane muestra la nota (vista
  abierta desde un tag de otra nota) **no hay** celda abierta: no se marca una sección que el editor no
  enseña. La abierta lleva cabecera sólida del color con tinta en contraste (`resolveSectionInk`, ver
  abajo) y etiqueta "OPEN".
- **Cabecera neutra + esquina doblada:** la cabecera de cada celda (`.note-grid-head`) es una franja
  neutra algo más clara (`rgb(var(--text) / 0.05)`; 0.03 si está oculta a la IA) para que el nombre se lea
  como título de la tarjeta; la abierta la tiene sólida (ver arriba). El color de la sección va **solo**
  en la esquina doblada del mapa (`.section-map-corner`), aquí más grande: 14 px en reposo y 20 px en
  hover, con su misma transición; gris apagada si está oculta a la IA y ausente en la abierta. Se probó
  la cabecera tintada al 14 % con el color y se descartó (no convencía). La casilla de selección va a
  26 px del borde derecho, a la izquierda de la esquina (la cabecera reserva 50 px). El contenido arranca
  8 px por debajo de la cabecera (`.note-grid-body` padding-top).
- **Compartido con el mapa** (no duplicar): la junta de destino al arrastrar es `.section-map-drop`
  (`data-side`/`data-inside`), el lado de caída es `reorderDropSide()` de `lib/sectionMap.ts` y el
  reordenado `moveSectionInList` vía `mutateSections` (la misma acción que el mapa). La tinta del sólido es
  `resolveSectionInk()` de `lib/sectionInk.ts` (antes privada del mapa; mezcla al 72 % con `--bg-editor` si
  está oculta a la IA); con `--accent` da también `--ng-accent-ink`, la tinta de las casillas marcadas.
- **Borde del bloque en el drop:** como las filas son explícitas, "junta = borde del bloque" se sabe por
  la posición en la fila (primera/última celda), sin medir rects (el mapa sí mide).
- **Soltar sobre "New section"** lleva la tarjeta **al final** (`moveSectionToEnd` de
  `lib/sectionUtils.ts`; no-op si ya es la última). La barra va en la junta antes de esa celda, o —si es
  una franja propia porque la última fila estaba llena— dentro del borde derecho de la última tarjeta.
- **Vista previa** (`SectionCell`, `memo`; cuerpo + pie en `NoteOverview/SectionCardContent.tsx`, compartido
  con la tarjeta de preview de hover y cerebro): el HTML de `htmlFromMarkdown` (el mismo renderizado que el
  editor) dentro de `.note-grid-body.note-preview > .prose-editor > .ProseMirror`,
  restilado **a tamaño real** (11 px, títulos 12 px seminegrita en color de texto, código 10 px mono), sin
  título de nota, fecha ni toolbar falsa, con `mask-image` que lo desvanece abajo. **Fuente = la del
  editor:** `.note-grid` define `--prose-font-family` con `proseFontStack(fontFamily)` (de
  `stores/editorSettingsStore.ts`, la misma función que usan `Editor.tsx` y el textarea raw de
  `NoteEditor`), porque la vista se pinta fuera del contenedor del editor que la define y si no caería al
  fallback mono de `.prose-editor .ProseMirror`. Tamaños enteros a propósito (los fraccionarios
  emborronan la mono en Chromium, como en `.chat-md`, y la fuente del editor puede ser la mono), por eso
  no los 11,5 px del boceto. Secciones raw → texto crudo (`.note-grid-raw`, con la misma
  `--prose-font-family` que el textarea raw). Solo se renderiza el principio de una sección larga
  (`clipPreviewMarkdown`, 4000 chars, corta en límite de bloque y cierra un fence abierto) y el HTML/las
  estadísticas se memoizan por contenido; los handlers llegan a las celdas por una fachada estable (ref),
  así que teclear en una sección (otra ventana/pane) solo re-renderiza su tarjeta.
- **Pie:** `sectionCardStats(md)` → "Empty" / `hechas/total tasks` con ≥ 3 tareas (`- [ ]`/`- [x]` como
  `markdownHtml`, fuera de fences; las tarjetas de kanban cuentan) / nº de palabras (sin sintaxis, URLs de
  links, anotaciones 📅⏰🔺 ni comentarios HTML). A la derecha, "Text" (modo texto, `isRawMode`) y "Hidden from AI".
- **Clic, doble clic y nombre:** un `<button class="note-grid-open">` cubre la celda (clic, foco, Intro);
  la cabecera es `pointer-events: none` salvo el `<span>` del nombre. **Doble clic en el nombre = renombrar
  inline** (input con anillo del color de la sección, Enter/blur guarda, Esc cancela, `F2` desde el
  teclado). Para que el clic simple no abra antes, un clic simple **en el nombre** abre con 250 ms de
  retraso y el segundo clic (`detail === 2`) lo cancela y renombra; en el resto de la celda el clic abre al
  instante. Un doble clic más lento que el retraso solo abre la sección (fallo inocuo). Cualquier otra
  interacción en esos 250 ms (casilla, Ctrl/Cmd/Mayús+clic, clic derecho, Ctrl+A, arrastre, F2) cancela el
  temporizador, y al vencer no abre si ya hay selección o renombrado en curso. Con selección activa el
  nombre no recibe clics (todo togglea).
- **Selección múltiple:** estado local `selectedIds: Set<string>` (por id, nunca índice); `App.tsx` keya la
  vista por `noteViewId`, así que cambiar de nota remonta y resetea sin effects. Casilla `role="checkbox"`
  a la izquierda de la esquina doblada (visible en hover y siempre con selección); marcada → anillo de acento de 1,5 px (un
  `::after` por encima de la cabecera sólida). Ctrl/Cmd-click togglea, Shift-click selecciona el rango
  (orden `note.sections`) desde el ancla, y con selección activa basta un clic. La barra flotante (sticky
  abajo) es otro bloque reticulado (`.note-grid-sbar`): contador en acento, **Hide/Show to AI** (solo
  `!note.encryption`), **Text mode / Markdown mode**, **Delete** (deshabilitado con tooltip si están todas; confirma
  con `ConfirmModal`) y limpiar. Los derivados se calculan filtrando `selectedIds` contra `note.sections`.
- **Teclado:** flechas mueven el foco entre celdas (`gridNeighbor`: ←→ en orden de pestañas, ↑↓ a la
  celda de la fila vecina bajo el centro, en fracciones de fila); Intro abre. `Esc` (listener de `window`
  en burbuja): limpia la selección y si no hay, cierra la vista. No hace nada con un input propio, la
  confirmación propia, un menú o **cualquier modal** (`[aria-modal="true"]`: `ConfirmModal`,
  `EncryptionModal` — p. ej. la confirmación de borrar nota o el desbloqueo que abre el menú `⋯`) abiertos.
  Menú/modal se miran en un listener de **captura** de `window` que guarda el estado al empezar la
  pulsación: corre antes que todos los de burbuja, así que no importa si el listener del modal (que lo
  cierra con ese mismo Escape) va antes o después del nuestro. `Ctrl/Cmd+A` = seleccionar todo (no en
  campos de texto, ni con un menú o modal abiertos).
- **Cabecera** en el mismo plano (sin banda ni borde): título editable inline (click/lápiz → input con
  commit debounced en blur/Enter, Esc revierte; no editable con `locked`), "N sections · edited …",
  Select all, y a la derecha el **botón de cuadrícula activo** (`aria-pressed`, cierra la vista), favorito
  y **`⋯`** = `NoteContextMenu` de **nota** (`sectionId: null`) con `onRenameNote` (prop opcional que añade
  "Rename note" arriba y enfoca el título); **Delete note** vive ahí (con su confirmación y el desbloqueo
  previo si la nota está bloqueada). Notas cifradas bloqueadas: estado "encrypted" sin rejilla.
- El reset global `button { border: none }` obliga a dar `border` con estilo explícito (la casilla usa
  `border: 1.5px solid …`).

### Previsualización de sección (hover + cerebro)
Dos interacciones sin IPC nuevo (el contenido de toda sección ya está en memoria en `notesStore`) con
**la misma tarjeta**: `SectionPreview/SectionHoverCard.tsx` = **una celda de la vista de nota en
apaisado**, siempre al tamaño fijo **360×190** de `SectionPreview/previewSize.ts` (fuente única:
`PREVIEW_CARD_WIDTH`/`PREVIEW_CARD_HEIGHT`, margen de viewport y `previewCardWidth()`, que capa el ancho a
`innerWidth - 2·margen` en ventanas estrechas), así todas las previews son el mismo rectángulo. La
tarjeta es presentación pura y rellena la caja que su anfitrión posiciona y dimensiona.
- **Hover** (`SectionPreview/HoverPreviewProvider.tsx`, montado en `App.tsx`): un **único** popover en
  portal a `document.body` con la tarjeta.
  Reutiliza las clases de la celda (`.note-grid-head`, y cuerpo + pie vía `SectionCardContent`: contenido
  a tamaño de lectura con su fade, raw → `.note-grid-raw`, vacía → `.note-grid-empty`, pie con
  estadísticas y badges "Text"/"Hidden from AI") y la esquina doblada (`.section-map-corner`, 14 px); en
  `.section-hover-*` solo lo distinto: superficie **opaca** (`--bg-editor` + el tinte 0.06 de la celda,
  borde `--text / 0.12`, radio 8 px, sombra más suave en tema claro), el **nombre en el color de la
  sección** (prioridad: hasta el 60 % de la cabecera) y a la derecha el **título de la nota** atenuado
  a 11 px (contexto en Chat/Related; fallback "Untitled"); la cabecera reserva 24 px a la derecha para
  la esquina. Oculta a la IA: `EyeOff`, nombre al 60 %, tinte/cabecera más tenues y esquina gris. Como
  vive en un portal, la propia tarjeta define `--prose-font-family` (`proseFontStack`) y
  `--ng-accent-ink` (`resolveSectionInk('--accent')`, recalculado al cambiar tema/acento). El hook `useSectionHoverPreview()` (en `hoverPreviewContext.ts`, archivo
  aparte por la regla `react-refresh/only-export-components`) expone `previewProps(noteId, sectionId, opts)`
  que devuelve handlers de ratón para escupir sobre cualquier disparador. Disparadores cableados:
  `SectionCell` (celdas de las filas de nota del sidebar —mapa abierto, peek, búsqueda y fila con
  scroll—, peek de grupo colapsado y filas de la vista de contenido; omite la abierta), pestañas del
  editor (omite la activa), `RelatedView`/`ChatView`.
  `placement: 'cursor-below'` ancla la esquina sup-izq junto al cursor (sidebar/grupos/editor);
  `'element-right'` (default) al lado del elemento (IA). Retardo ~380 ms; el popover es `pointer-events-none`
  y se cierra con **cualquier click** (listener `pointerdown` global en el provider — esto evita que se quede
  pegado al pasar una pestaña del editor a "activa" y perder sus handlers). `title:''` en los handlers
  suprime el tooltip nativo del ancestro. Posición flash-free: primera pintura con altura estimada +
  `opacity:0`, se mide en `useLayoutEffect` y se revela.
- **Cerebro** (`Brain/BrainNodePreview.tsx`, con la misma `SectionHoverCard`): NO es hover. Click
  en un nodo nota/sección llama `onNodeActivate(noteId, sectionId, clientX, clientY)` (en vez de
  navegar) → `BrainView` fija la tarjeta **clicable** (un `<button>` en portal, `title`/`aria-label` =
  `overview.openSection`) bajo el click, centrada, volteada encima si desborda y acotada al viewport
  con el ancho capado; como el tamaño es fijo se coloca sin pasada de medida. Pulsarla navega
  (`openNote`), click fuera (`pointerdown`) o `Esc` la cierra. Estado interactivo en
  `.section-preview-button` (`index.css`): el botón es una caja desnuda que la tarjeta rellena (sin
  borde/fondo/padding propios), el borde de la tarjeta pasa de `--text / 0.12` a `0.3` en hover y el
  foco de teclado muestra un anillo `--accent`. Los hijos de la tarjeta son `pointer-events: none`, así
  que el click cae en la tarjeta y burbujea al botón. Sustituyó al antiguo "fly-in" de cámara (eliminado).

### Editor: marcas y bloques markdown (round-trip md↔html)
El editor TipTap (`src/components/Editor/Editor.tsx`) registra las extensiones **una a una** (sin
StarterKit). Las que definen el **esquema** (nodos, marcas, atributos) viven en
`src/components/Editor/editorExtensions.ts` (`schemaExtensions()`); `Editor.tsx` las expande y solo
añade encima las de comportamiento (historial, placeholder, búsqueda, slash, autocierre). El harness
de round-trip construye el esquema con esa misma lista, así no puede divergir de la app: **toda
extensión que cambie el esquema va ahí**. Todo elemento soportado **round-trippea** por
`src/lib/markdownHtml.ts`, fuente única de verdad de la conversión, que debe mantenerse **simétrica**
(y lo vigila `tests/lib/editorRoundTrip.test.ts`, ver "Harness de round-trip" abajo): marcas inline en
`inlineToHtml` (vive en `src/lib/markdownInline.ts`, hoja compartida con `kanban.ts` para no crear
ciclos) / `inlineElToMd`, bloques en el bucle de `htmlFromMarkdown`/`blockElToMd`. Las mismas
funciones las usan los previews (vista de nota, tarjeta de preview, panel de la vista de contenido), así que un elemento nuevo aparece también en ellos sin
código extra (estilo por selector `.prose-editor .ProseMirror …` en `index.css`).
- **Bold neutro + highlight de acento (decisión):** la negrita (`**`) ya **no** usa el color de
  acento (`strong { color: inherit }`); el texto en color de acento es una marca aparte, **highlight**
  `==texto==` → `<mark>` (`@tiptap/extension-highlight`, `multicolor` off; `mark { color: var(--accent);
  background: transparent }`). Botón en la toolbar (icono `Highlighter`).
- **Subrayado `++texto++` y resaltado `==texto==` — reglas de flanqueo (decisión):** markdown no tiene
  subrayado; NoteFlow escribe `<u>` como `++…++` (`@tiptap/extension-underline` no tiene input rule:
  teclear `++x++` no convierte al vuelo, sí al recargar). Como `+`/`=` aparecen mucho en texto plano,
  un delimitador solo cuenta si **flanquea** el texto (`flankedMarkRe` en `markdownInline.ts`): el que
  abre no va precedido de letra/dígito ni del propio carácter y lo primero tras su racha no es espacio;
  el que cierra no va seguido de letra/dígito ni del propio carácter (toma los dos últimos de la racha:
  `++Learn C++++`). Así siguen siendo texto `C++`, `C++11 vs C++14`, `C++/C++`, `a++b++`, `a ++ b ++ c`,
  `a == b`, `x==y`, `a === b === c` (antes se subrayaban/resaltaban y el editor guardaba el texto
  destrozado). Se **tolera espacio antes del cierre** porque builds anteriores escribían `++palabra ++`
  (doble click en Windows selecciona el espacio final). Sin subrayado/resaltado **dentro de palabra**.
  - **Spans protegidos en `inlineToHtml`:** antes de las regex de marcas, los code spans (que ahora se
    procesan **primero**: `` `[a](b)` `` es código literal, no un link) y las etiquetas generadas
    (`<img>`, `<a>`, pill de relación) se apartan tras placeholders de uso privado (`\uE000n\uE001`; los
    que ya traiga el texto se apartan a su vez, así no colisionan) y se restauran al final. Arregla
    `` `i++` y `j++` `` en una línea (antes se emparejaban a través de los `<code>` → HTML mal anidado
    guardado como `` `i`++ y ++`j` ``), `` `a*b*c` ``, y `*`/`__`/`++` dentro de URLs.
  - **Vuelta (`inlineElToMd` → `resolveFlankedMarks`):** los delimitadores `++`/`==` se emiten como
    tokens y se resuelven con la línea completa: una marca que cruza un `<br>` se cierra y reabre; el
    espacio de los bordes sale fuera (`<u>word </u>` → `++word++ `); y la línea se **relee** con la
    misma regex (`flankedMarkPairs`, spans protegidos enmascarados): una marca que no volvería igual
    (dentro de palabra, o `<u>a++ b</u>`, que se cerraría en el `++` literal) se escribe **sin
    delimitadores** — se pierde el formato, nunca el texto. El `++`/`==` literal del texto se escribe
    tal cual (no hay sintaxis de escape, igual que con `**`/`*`).
  - **Ambigüedades que quedan:** texto que ya **es** sintaxis válida (`++i … i++` en prosa sin
    backticks, `++x++` tecleado, `a ++b ++ c` → "b " subrayado y se guarda `a ++b++  c`) se lee como
    marca al recargar; marcas de distinto tipo cruzadas
    (`++a ==b++ c==`) dan HTML mal anidado (como ya pasaba con `**`/`*`). Tests en
    `tests/lib/markdownInline.test.ts`. No hay espejo de este parser en `cli/`/`electron/`; la app
    móvil (repo aparte) debe aplicar la misma regla si interpreta `++`/`==`.
- **Tareas multilínea — anotaciones en líneas de continuación:** el serializador escribe 📅⏰🔺 en la
  **primera** línea; el parser recupera de una línea de continuación (formato de builds antiguos) solo
  los **tipos que la tarea aún no tiene**. Si ya tiene ese tipo, la anotación de la continuación es
  texto del usuario y se queda tal cual (`- [ ] Ship 📅2026-01-02` / `was 📅2025-12-20 before slip`;
  antes se cortaba y se perdía). Tests en `tests/lib/markdownHtml.test.ts`.
- **Blockquote / cita (`> texto`, estilo VSCode):** `@tiptap/extension-blockquote` (contenido
  `block+`: dentro puede haber listas, código, headings, tablas, citas anidadas). Round-trip exacto:
  `blockElToMd` serializa los bloques de la cita como markdown normal y prefija cada línea con `> `
  (línea vacía → `>`), quitando **solo** el separador `\n\n` del último bloque (antes quitaba todos
  los `\n` finales y se perdían hard breaks/párrafos vacíos al final de la cita); `mdBlockquoteToHtml`
  quita el `> ` de cada línea y **parsea el resto como markdown propio** (recursión de
  `markdownBlocksToHtml`; dentro de una cita **no** se detectan tableros kanban — `quoteDepth` — porque
  el esquema los sacaría de la cita: sus marcadores siguen siendo texto citado). Antes solo entendía párrafos: una lista, código o heading dentro de una
  cita (que el editor sí escribía) volvía como texto plano `- a`/```` ``` ````. Para citas de solo
  párrafos el resultado es el de siempre (`> a\n> b` → un `<p>` con `<br>`, `>` vacío → nuevo
  párrafo); con varias líneas `>` vacías seguidas ahora cuentan como en el nivel superior (párrafos
  vacíos / hard break) en vez de colapsarse. Estilo: borde izquierdo del color
  `--code-accent` (fallback `--accent`; personalizable — ver "Colores del editor") + texto atenuado.
  Botón en la toolbar (icono `Quote`).
- **Bloque de código — aspecto (`index.css`, `.prose-editor .ProseMirror pre`):** borde fino uniforme
  de 1px (`--border`), **fondo = el del editor** (`--bg-editor`, la superficie del `<main>` de
  `App.tsx`), radio 6px y padding ajustado y simétrico (`0.7rem 0.9rem`): **no se reserva hueco** para
  los botones. Sin borde izquierdo de acento (ya no usa `--code-accent`). El `pre code` mide **1px más
  que el código inline** (`calc(0.85em + 1px)`; 12px en el chat, 11px en el grid). Overrides con scope: el chat
  (`.chat-md`, padding propio) y el grid del overview (`.note-grid-body`, sin borde y fondo tenue).
- **Bloque de código — botones y selector de lenguaje (`CodeBlockWithCopy.tsx`):** el NodeView de
  `CodeBlockLowlight` pinta dos chips flotantes (`.code-block-btn`, radio 6px, fondo `--bg-2` +
  borde + sombra): a la izquierda el lenguaje actual ("Plain text" si `language` es null) y a la
  derecha Copy. **Ambos solo aparecen en hover** del bloque (`opacity:0` + `pointer-events:none` en
  reposo; también visibles con `:focus-visible`) y quedan **centrados sobre el borde superior**
  (`top:0` + `translateY(-50%)`), tapándolo. Son
  **hermanos del `<pre>`** dentro del wrapper (`.code-block-node`, `position: relative`), no hijos: así
  el `overflow-x:auto` del `pre` no los arrastra al hacer scroll horizontal (el margen del `pre` colapsa
  a través del wrapper, así que su borde superior coincide con el del `pre`). Mientras el dropdown está
  abierto el wrapper lleva `is-menu-open` y los botones siguen visibles (el ratón sale del bloque para
  llegar al menú portalado). El botón izquierdo abre un dropdown
  (portalado a `document.body` con `createPortal`, `position: fixed` para no recortarse con el
  `overflow-x:auto` del `pre`) con buscador + "Plain text" (fija `language=null`) + los lenguajes de
  `extension.options.lowlight.listLanguages()` (se filtra `plaintext`, ya cubierto por "Plain text"),
  ordenados por label legible (`LANGUAGE_LABELS`, fallback = capitalizar id). **Se guarda siempre el id
  real de lowlight** en `node.attrs.language` (no el label) para no romper resaltado ni round-trip.
  Posiciona el dropdown `fixed` directamente desde `getBoundingClientRect()` del botón (clampeado al
  viewport tras medirse); cierra con click-fuera y Escape. No toca `markdownHtml.ts` ni el formato. Estilos `.code-lang-*` en
  `index.css`.
- **Orden de detección de bloque** (`blockKind`, única función que lo decide; la usan el render y
  `groupBlocks`): code fence → heading → HR → kanban → lista → blockquote → tabla → párrafo (un
  prefijo `>` no choca con bullets/ordenadas/headings; un bloque que empieza por `<!-- kanban -->`
  pero no es un tablero válido sigue cayendo a párrafo). Pipeline: pre-pasadas `isolateCodeFences` →
  `isolateKanbanBlocks`, split por `\n\n`, **`groupBlocks`** (reagrupa listas y recoloca el `\n`
  impar, ver "Listas…" y "El `\n` impar…" abajo) y `blockToHtml` por bloque.
- **Bloques pegados a un heading o a una tabla (markdown externo/LLM):** una línea heading dentro de
  un bloque de párrafo (`## Título\n- a`) **corta el bloque**: lo de encima y lo de debajo se
  clasifican como bloques propios (`blockToHtml`), que es justo como se releen tras guardar (el
  serializador separa el heading). Antes lo de debajo quedaba como texto del párrafo y en el
  siguiente guardado+reapertura se convertía en lista/tabla/HR (no idempotente). Igual en tablas:
  las filas llegan hasta la **primera línea sin `|`**; lo pegado debajo es un bloque propio. Antes
  `mdTableToHtml` **descartaba** las líneas sin `|` del bloque (pérdida de texto: el texto que un LLM
  pega justo tras una tabla desaparecía al abrir y guardar).
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
  3. Asegura un **límite de bloque antes de la apertura** de cada par (`ensureBlockStart`: añade una
     línea vacía solo si el fence va **pegado** a la línea de encima; tras una racha impar de `\n` el
     `\n` sobrante lo recoloca `groupBlocks` como hard break del bloque de encima).
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
    antes el fence salía como texto; luego salía `<p></p>` + código (se perdía el break y aparecía un
    párrafo vacío); ahora vuelve exacto: `a<br>` + código (ver "El `\n` impar…").
  - Las líneas vacías al **final** del código se descartan al leer (antes se quitaban al guardar: el
    `FENCE_BLANK` se borraba después del `trimEnd()` y el código cambiaba entre aperturas).
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
- **Tablero kanban en la nota (`src/lib/kanban.ts`).** Formato en disco + round-trip md↔html (abajo)
  y editor rich (nodo TipTap + NodeView React, ver "Tablero kanban: editor" justo después).
  Formato (markdown plano dentro del `.md` de la sección; puede haber varios por sección):
  ```md
  <!-- kanban done="Done" -->
  - Todo
    - [ ] Design the NodeView 📅2026-10-12 🔺high
      - sub-bullet (se conserva literal como `extra` de la tarjeta)
  - Done
    - [x] Pick the format
  <!-- /kanban -->
  ```
  - Marcadores en columna 0. Atributos del de apertura = string crudo (`attrs`) que se reescribe
    **literal**; v1 solo interpreta `done="<columna>"` (valores con `& " < >` como entidades). Columna
    = `- nombre` en columna 0 (texto plano; `-` solo = nombre vacío). Tarjeta = tarea con **2
    espacios** exactos (`  - [ ]`/`  - [x]`) con las anotaciones 📅⏰🔺 (mismo orden de escritura que
    `listElToMd`, helper compartido `taskAnnotationsToMd`). Líneas más indentadas (≥3 espacios o tab)
    = `extra` de la tarjeta anterior, literal. Líneas en blanco dentro: se toleran, no se emiten.
  - **Nunca destroza contenido:** si algo entre los marcadores no encaja (párrafo, bullet que no es
    tarea, indentación rara, lista ordenada, tarjeta antes de columna, extra bajo columna, otro
    marcador…), `parseKanbanMarkdown` devuelve `null` y la región se pinta **exactamente como antes**
    (los marcadores como texto literal). Apertura sin cierre: intacta. La normalización que sí hace un
    tablero válido es solo de forma: espacios de marcadores/nombres, orden de anotaciones (al final),
    líneas en blanco internas fuera, y límites `\n\n` antes/después del tablero.
  - **`isolateKanbanBlocks`** (pre-pasada, **después** de `isolateCodeFences`: necesita saber qué
    líneas son código, y eso solo queda fijado tras aislar fences). Calcula las líneas de bloques de
    código (`codeBlockLines`: línea ```` ``` ```` al inicio del texto o tras una línea vacía, hasta la
    siguiente línea vacía — la misma regla que aplican `ensureBlockStart`/`groupBlocks`) e ignora
    aperturas dentro de código. Empareja cada apertura con
    el **primer** cierre posterior; solo si la región parsea como tablero asegura límite de bloque
    antes/después (solo donde falta) y protege sus líneas vacías con el centinela `FENCE_BLANK`. Si no
    parsea, salta esa apertura y sigue en la línea siguiente (una apertura posterior puede formar un
    tablero válido con ese mismo cierre). Un ```` ``` ```` pegado justo tras el cierre (fence sin
    pareja) haría código al separarlo → ese tablero se deja como texto.
  - **Ambigüedad heredada (aceptada):** un tablero pegado **entre dos fences** sin líneas en blanco
    queda dentro del bloque de código (regla "hasta el último cierre del bloque" de fences anidados).
    Se conserva literal como código; no se pierde nada.
  - **HTML estructurado** (lo consumen previews/chat ya, y el NodeView de la fase 2). La **fuente de
    verdad** de la vuelta son los `data-*` (`data-name`, `data-md`, …), **no** el HTML interior:
    ```html
    <div data-type="kanban" data-attrs="done=&quot;Done&quot;">
      <div data-kanban-column data-name="Done" data-done="true">   <!-- data-done solo en la columna done -->
        <div data-kanban-column-title>Done</div>
        <ul data-type="taskList">
          <li data-type="taskItem" data-checked="true" data-due data-alarm data-importance data-md="…" data-extra="…">
            <label><input type="checkbox" checked></label><p>…inlineToHtml(md)…</p></li>
        </ul></div></div>
    ```
    `blockElToMd` trata `div[data-type="kanban"]` antes de la bajada genérica a hijos y añade el
    `\n\n` final (`serializeKanbanMarkdown` acaba en el marcador de cierre).
  - **API exportada** (`kanban.ts`): tipos `KanbanBoardData {attrs, done, columns}` /
    `KanbanColumn {name, cards}` / `KanbanCard {md, checked, due, alarm, importance, extra}` (`md` =
    texto sin anotaciones, una línea; `extra` = líneas hijas crudas, `''` = ninguna);
    `parseKanbanMarkdown(block)` (→ `null` si no es tablero), `serializeKanbanMarkdown(data)` (siempre
    re-parseable: aplana saltos de línea, indenta extras mal indentados; `done` manda y se sincroniza
    en `attrs` con `setKanbanAttr`), `kanbanDataToHtml(data)`, `kanbanDataFromElement(el)`,
    `getKanbanAttr`/`setKanbanAttr`, `KANBAN_OPEN_RE`/`KANBAN_CLOSE_RE`. `looksLikeMarkdown` detecta
    la línea de apertura (pegar un tablero pasa por `htmlFromMarkdown`).
  - `kanbanDataToHtml` escribe `data-attrs` con `done` ya sincronizado (`setKanbanAttr`), igual que el
    serializador: `kanbanDataFromElement` lee `done` **de `data-attrs`**, así que un `attrs` desfasado
    respecto a `done` (p. ej. tras renombrar la columna done) no puede perder la columna done al guardar.
  - Las alarmas también salen de las tarjetas (`TASK_ALARM_RE` admite indentación). Tests en
    `tests/lib/kanban.test.ts` (incl. fuzz de round-trip); usan un DOM mínimo
    (`tests/helpers/miniDom.ts`, solo entiende la salida de `htmlFromMarkdown`) para correr
    `htmlToMarkdown` en el entorno node de vitest.
- **Tablero kanban: editor (`components/Editor/KanbanBoard.ts` + `KanbanBoardView.tsx`).**
  - **Nodo** `kanbanBoard`: bloque **atom**, `selectable`, no arrastrable por ProseMirror, un único
    atributo `board` (`KanbanBoardData`, JSON-safe). `parseHTML` = `div[data-type="kanban"]` con
    `kanbanDataFromElement`; `renderHTML` devuelve el DOM de **`kanbanDataToHtml`** (no un
    DOMOutputSpec espejo), así `editor.getHTML()` → `htmlToMarkdown` (la ruta de guardado de
    `Editor.tsx`, debounce 400 ms) reescribe exactamente el mismo markdown; vale igual para pegar
    (markdown → `htmlFromMarkdown` → `parseSlice`, o el HTML de copiar un tablero seleccionado) y para
    undo/redo. `renderText` = el markdown (texto plano del portapapeles / `getText`). Test que simula la
    ruta carga → atributo clonado por JSON → render → guardado en `tests/lib/kanbanOps.test.ts`.
  - **Solo en el nivel superior:** grupo propio `topBlock` y el documento se extiende a
    `content: '(block | topBlock)+'` (`TopLevelDocument` en `editorExtensions.ts`). Un tablero dentro de un
    ítem de lista/cita/celda lo tiraría el serializador (`listElToMd` ignora el `div`); así pegar uno
    dentro de una lista parte la lista y lo deja arriba.
  - **NodeView:** todo cambio es una transformación pura de **`src/lib/kanbanOps.ts`** (tests en
    `tests/lib/kanbanOps.test.ts`) aplicada al nodo **vivo** (`editor.state.doc.nodeAt(getPos())`, no al
    closure del render) y escrita con `updateAttributes` → una transacción normal (historial,
    autosave). Las ops devuelven el **mismo objeto** si no cambian nada (sin transacción vacía) y
    mantienen `attrs` sincronizado con `done`. Todo `.kanban-board` lleva `data-kanban-interactive`:
    el `stopEvent` del nodo entrega a React cualquier evento de dentro e `ignoreMutation` es siempre
    true. Mousedown fuera de campos de texto hace `preventDefault` y enfoca la **raíz del tablero**
    (`tabIndex=-1`): no mueve el caret de ProseMirror, cierra/commitea un editor inline por blur, y en
    la raíz `Ctrl+Z`/`Ctrl+Shift+Z`/`Ctrl+Y` llaman a `editor.commands.undo/redo` (ProseMirror no ve
    esas teclas por `stopEvent`); `Esc` selecciona el nodo. El handle de la cabecera ("KANBAN · n
    columns · n cards") hace `setNodeSelection` + `view.focus()` → `Backspace`/`Delete` lo borran como
    cualquier atom. En los textarea inline las teclas sin modificador hacen `stopPropagation` (Enter,
    Backspace… no llegan a los handlers del editor/NoteEditor); las combinaciones con Ctrl/Meta siguen
    burbujeando (atajos globales, tamaño de fuente). Tras aplicar algo desde un menú/picker el foco
    vuelve a la raíz del tablero (Ctrl+Z inmediato); si se descartan, el foco queda donde se clicó.
  - **Sync externo con el tablero enfocado:** el contenido externo se aplica también con el foco en el
    editor (ver "Sync de contenido externo en los editores"; allí también la composición IME). Excepción: con el foco en un
    **campo de texto** de un widget de NodeView (textarea/input de una tarjeta abierta:
    **`widgetFieldHasFocus`** en `src/lib/editorFocus.ts`, solo si `document.hasFocus()`), el borrador
    vive en React fuera de ProseMirror y no se reemplaza el documento: se marca como diferido y se
    reintenta en `focusout` del DOM del editor (tras un `setTimeout(0)`, después del commit por
    `onBlur` del campo) y en `blur` de la ventana. Si mientras tanto hay una edición local (Enter en el
    compositor commitea y deja el campo abierto), `saveContent` funde primero lo diferido (merge) antes
    de guardar — si no, se guardaría el documento viejo encima. Con el foco en la **raíz** del tablero
    no se difiere (no hay borrador; diferir dejaría que la siguiente operación del tablero guardase lo
    viejo). Los popups portalados a `<body>` no cuentan, pero al aplicar devuelven el foco a la raíz.
  - **Handlers del wrapper de `Editor.tsx`** (`onPaste`/`onDrop` de imágenes, `onKeyDown` con
    Ctrl+Shift+B / Enter tras HR) **ignoran** eventos nacidos en widgets de NodeView o sus popups
    (`isEditorWidgetTarget`: `[data-kanban-interactive]`, `.kanban-menu`, pickers de tarea): actúan
    sobre la selección de ProseMirror, que puede ser una NodeSelection del propio tablero (pegar una
    captura la reemplazaba). Un drop de ficheros sobre el tablero solo hace `preventDefault` (que el
    navegador no abra el fichero); pegar texto en un campo de tarjeta es nativo.
  - **Semántica de la columna done** (atributo `done`, en `kanbanOps`): mover una tarjeta **a** la
    columna done la marca, sacarla la desmarca; marcar el checkbox la mueve al **final** de la done;
    desmarcar una que está en la done la mueve al **final** de la primera columna no-done; sin columna
    done el checkbox solo alterna. Renombrar la done mantiene `done`; borrarla lo limpia. Los nombres de
    columna se hacen **únicos** (sufijo " 2"…) al añadir/renombrar: el nombre identifica la columna done.
  - **Texto de tarjeta:** `md` nunca lleva anotaciones; el editor inline (Enter guarda, Esc cancela,
    blur guarda; una tarjeta **nueva** vacía no se crea; el compositor sigue abierto tras Enter para
    encadenar tarjetas) pasa el texto por `applyCardText`, que aplana a una línea y saca 📅⏰🔺 tecleados a
    sus campos. Se pinta con `inlineToHtml` (vía `innerHTML`: por eso `inlineToHtml` escapa `"` en los
    valores de atributo — `src`/`alt`/`href`/ids de relación — y una URL no puede inyectar atributos;
    `getAttribute` lo decodifica al volver a markdown, round-trip intacto) (negrita, links, highlight, pills de relación: click en una
    pill navega con `navigateToSection`; click en un link lo abre el handler de links de `Editor.tsx`).
    Chips 📅/⏰/🔺 con las mismas clases (`task-badge`, `task-importance-dot`) y los **mismos pickers** que
    las tareas (`TaskPickers.tsx` + helpers `taskBadge.ts`, extraídos de `DeadlineTaskItemView`). `extra`
    se conserva sin editar: chip "≡ n" con tooltip (editable en modo texto).
  - **Drag & drop** propio con pointer events (sin dependencia nueva; HTML5 DnD descartado: el drop lo
    intercepta ProseMirror y el ghost nativo es feo). Umbral 4 px; ghost portalado a `<body>`
    (`position: fixed`, se mueve con `transform` sin re-render), la tarjeta/columna origen queda
    atenuada; línea neón de drop (`.kanban-drop-line` / `.kanban-column-drop-line`); el hit-test va en
    un bucle rAF que además auto-scrollea el tablero (horizontal) y el editor (vertical) cerca de los
    bordes. Soltar donde ya estaba = no-op sin indicador. `Esc` cancela; el click posterior al drop se
    traga (capture, una vez). Columnas: se arrastran por la cabecera.
    **Coordenadas:** `clientX/Y`, `getBoundingClientRect()` y los px del ghost/indicadores comparten
    espacio (el zoom de UI es nativo, ver "UI text size"), así que se comparan sin conversión.
  - **Ancho (decisión del usuario):** el tablero **no** respeta la columna Readable: el wrapper
    (`.node-kanbanBoard`, hijo directo de `.ProseMirror`) anula el padding horizontal del editor con
    márgenes negativos, que `index.css` expone como vars en `.prose-editor .ProseMirror`
    (`--pm-pad-l`, `--pm-pad-r`, `--pm-bleed-r` = cuánto puede invadir el padding derecho: 0 con el
    índice visible para no pasar bajo sus rayitas; el sticky define sus propios valores). El scroller
    interno del tablero repone ese padding, así la primera columna se alinea con el borde izquierdo del
    texto en Full. Columnas de ancho fijo `--prose-font-size × 19` (~247 px a 13 px); si no caben, scroll
    horizontal **dentro** del tablero (el scroller de la nota sigue `overflow-x: hidden`).
  - **Insertar:** slash `/kanban` (o `/board`; `keywords` sin traducir en `SlashCommandItem`) → tablero
    con columnas i18n (To do / In progress / Done, done = la tercera) en el bloque de nivel superior
    actual (reemplaza un párrafo vacío; si no, va detrás — p. ej. detrás de toda la lista) y añade un
    párrafo vacío si quedaría al final del doc. Dentro de una task list de nivel superior aparece además
    **"Convert task list to board"**: ítems de nivel superior → tarjetas de la primera columna
    (estado/anotaciones; hijos → `extra`; ítems vacíos se descartan). La barra del tablero (hover) tiene
    **"Convert to task list"** (todas las tarjetas aplanadas, con estado/anotaciones/`extra`) y **borrar
    tablero** (doble click si tiene tarjetas). Borrar columna con tarjetas pide confirmación **inline en
    el menú** (segundo click): `ConfirmModal` no sirve aquí porque sus atajos escuchan en `window`
    (bubbling) y el `onKeyDown` de `NoteEditor` hace `stopPropagation` para todo lo que nace en su árbol
    React (portales incluidos). Todo es deshacible.
  - **Búsqueda en la nota:** el texto de un atom no tiene nodos de texto para las decoraciones. 
    `SearchHighlightExtension` cuenta los matches de cada tablero con `countKanbanMatches`
    (`src/lib/kanbanSearch.ts`: títulos de columna + texto renderizado de las tarjetas, por tramo de
    texto entre tags, como la búsqueda normal) y pone **una decoración de nodo** por tablero con
    `{query, caseSensitive, active}` en su spec; el NodeView la recibe en `decorations` y pinta los
    `<span class="nf-search-match">` con `highlightHtml` (misma función → el conteo no puede divergir).
    Next/prev sobre un match de tablero no mueve la selección; `InNoteSearchBar` centra el
    `.nf-search-match-active` (y desplaza el `.kanban-scroll` en horizontal si hace falta, ver
    "Búsqueda en nota"). Tests en `tests/lib/kanbanSearch.test.ts`.
  - **Previews:** vista de nota/tarjeta de preview/chat pintan el HTML estático de `htmlFromMarkdown`; el
    CSS de `.prose-editor .ProseMirror div[data-type="kanban"]` lo muestra como mini tablero de solo
    lectura (columnas en fila, compactas, `overflow: hidden`; en `.chat-md` más estrechas). También es
    el fallback si el NodeView aún no se montó.
  - Modo texto (`isRawMode`): intacto (markdown literal). Pendiente/no hecho en v1: metadatos de columna
    (color/WIP/colapsar), editar `extra` en la UI, mover tarjetas con teclado.
- **Invariante del separador de bloque en `blockElToMd`:** cada bloque serializado debe terminar en
  **exactamente `\n\n`** (`htmlFromMarkdown` separa bloques con `split(/\n\n/)`). Ojo con quién pone
  el separador: `tableElToMd` **ya devuelve** su `\n\n` final (el caso `table` no debe añadir nada),
  mientras que `listElToMd` cierra el último ítem con un solo `\n` y por eso el caso `ul`/`ol` sí
  suma `+ '\n'`; el caso kanban suma `+ '\n\n'` (su serializador acaba en el marcador de cierre). Un `\n` de más tras un bloque hace que el siguiente se reparsee con un hard break
  inicial (`<p><br>…`) y el hueco **crece en cada round-trip** guardar/reabrir (bug real con tablas).
  Aritmética que el parser debe invertir: un textblock que acaba en *m* hard breaks escribe *m* `\n`
  extra; toda lista de nivel superior acaba en un `\n` extra (separador); las listas anidadas van
  justo tras su ítem, sin línea en blanco. Así, entre dos listas de nivel superior hay 1 línea en
  blanco de separador + *m* (breaks finales del último ítem, el más profundo); entre ítems hermanos
  de una misma lista, exactamente *m*.
- **Listas: tareas, viñetas y numeradas nunca son hermanas (regla).** En el esquema un `taskList`
  solo contiene `taskItem` y un `bulletList`/`orderedList` solo `listItem`: ítems de distinto tipo
  son **listas consecutivas**. `groupBlocks` (`continueList`) ya no funde todos los bloques de lista
  seguidos: un bloque continúa la lista de encima solo si empieza por un ítem **anidado** (indentado;
  tras cualquier número de líneas en blanco, que son breaks del ítem de encima) o por un ítem de
  nivel superior del **mismo tipo** tras una línea en blanco (el comportamiento de siempre). Un ítem
  de nivel superior de **otro tipo** abre lista nueva y la línea en blanco anterior es el separador,
  no un break. `renderMdListItems` agrupa los hermanos consecutivos por tipo en listas separadas (a
  cualquier profundidad), así el HTML ya es el documento que construye ProseMirror. **Bug real
  arreglado:** `- [ ] a` / *blank* / `- b` / *blank* / `- [ ] c` se fundía en un `taskList` con un
  `<li>` normal dentro y cada ítem recibía un `<br>` final (línea fantasma); ProseMirror lo partía en
  3 listas, el serializador escribía otra vez el mismo markdown y la línea volvía aunque el usuario
  la borrase (y sin borrarla, cada guardado añadía otra: `\n\n\n`). Tampoco `- [ ] a\n- b` se
  convierte ya en dos tareas. En anidadas no hay separador: todas las líneas en blanco antes de un
  hermano de otro tipo son breaks del ítem de encima (como escribe `listElToMd`).
  - `- [x](url)` (viñeta que empieza por un link con texto `x`) ya no se lee como tarea marcada: tras
    `[ ]`/`[x]` se exige espacio o fin de línea (el resto de parsers de tareas — kanban, alarmas — ya
    lo exigían). Consecuencia: `- [ ]foo` (sin espacio) es ahora una viñeta con texto `[ ]foo`.
  - **Marcador vacío `- ` (`emptyMarkerIsItem`):** `listElToMd` escribe así una viñeta vacía y una
    cuya primera línea es un hard break (`- ` + el texto en las líneas siguientes). Solo **justo
    debajo de una viñeta hermana** se sigue leyendo como línea en blanco (legado YAML → break del ítem
    de encima, ambiguo); en cualquier otro sitio — primer ítem del bloque, primer hijo del ítem de
    encima, o tras una lista hermana de tareas/numerada — es una **viñeta vacía**. Antes, como primer
    ítem no había ítem de encima y **el texto se perdía** (`- \ntexto\n- b` → `- b`; también tras un
    heading pegado o dentro de una cita). Además el parser nunca descarta líneas: texto antes del
    primer ítem (inalcanzable hoy) sale como párrafo encima de la lista, y tras el marcador se acepta
    tabulador igual que en la detección de bloque (`-\tx` antes se perdía entero).
- **El `\n` impar entre bloques (`groupBlocks`).** El split por `\n\n` deja el `\n` impar al
  principio del bloque siguiente (`\nnext`). Si lo que sigue es un **párrafo**, se queda ahí como
  break inicial (`<p><br>y`, como siempre: ver ambigüedades). Si es cualquier otro bloque (heading,
  lista, fence, tabla, cita, HR, tablero), que no puede empezar por un break, es el **break final del
  bloque de encima** (`attachTrailingBreak`): párrafo (también el vacío, que pasa a `<p><br></p>`) o
  último ítem de lista; si encima hay un bloque que no admite breaks (heading, HR, código, tabla,
  cita, tablero) o es el inicio del texto, se descarta. Así `x<br>` + `# T`, `x<br>` + lista/fence/
  tablero vuelven exactos; antes `\n# T` daba `<p><br></p><h1>T</h1><p></p>` y el hueco crecía, `\n---`
  quedaba como texto, y un fence/tablero tras un break dejaba un `<p></p>`. Para que funcione,
  `ensureBlockStart` (pre-pasadas de fences y tableros) ya no fuerza paridad par: solo separa líneas
  pegadas.
- **Contenido de un ítem de lista: `paragraph+ list*` (decisión, `LIST_ITEM_CONTENT` en
  `editorExtensions.ts`, para `listItem` y `taskItem`).** Es lo que una lista markdown sabe escribir:
  su texto (uno o más párrafos; los extra se guardan como breaks del primero) y luego sublistas. Con
  el `paragraph block*` de TipTap había **pérdida de datos real**: Backspace al inicio de un ítem lo
  une al de encima como segundo párrafo, y escribir ahí `> `, ```` ``` ````, `# ` o `---` lo
  convertía en cita/código/heading/HR **dentro del ítem**, que `listElToMd` descarta → el texto
  desaparecía al guardar; igual al pegar HTML con un `<pre>` dentro de un `<li>`. Y Backspace al
  inicio del ítem que sigue a uno **con subítems** dejaba su texto **detrás** de la sublista, que al
  reabrir volvía **encima** (reordenado). Con la restricción: las input rules de bloque no saltan en
  la 2ª línea del ítem (el texto queda literal), ProseMirror coloca fuera de la lista (partiéndola)
  los bloques pegados o insertados, y ese Backspace anida el ítem bajo el anterior tras sus
  subítems. Backspace en un ítem sin subítems sigue uniéndolo como segunda línea. No afecta a la
  carga: el parser nunca produce otra cosa en un ítem. Tests de edición con un `Editor` real en
  `editorRoundTrip.test.ts`.
- **Headings: una sola línea.** Un heading markdown no admite saltos: `headingElToMd` escribe cada
  hard break de un heading como **un espacio** (sin los de los bordes, colapsando rachas; solo si hay
  breaks, el resto sale byte a byte). Antes Shift+Enter al inicio de `### ==Título==` guardaba
  `### \n==Título==` y al reabrir el heading se destruía en un párrafo con `###` literal. Un heading
  **vacío** (Enter al principio de uno) se guarda como párrafo vacío en vez de `### ` (que volvía como
  el texto "###"). En el editor, `LineBreak` (`editorExtensions.ts`, `HardBreak` extendido) hace que
  Shift+Enter / Mod+Enter dentro de un heading lo **parta** como Enter en vez de insertar el salto.
- **Celdas de tabla con varios bloques:** la celda es `block+` (Enter en una celda crea otro
  párrafo; se puede pegar una lista o código), pero una fila markdown es una línea. `tableElToMd`
  escribe los bloques de la celda **uno por línea** (`<br>` en la celda: `cellLines`); antes los
  pegaba sin separador (`a` + `b` → `ab`, corrupción de texto). Listas y código conservan el texto,
  no la estructura; una celda con contenido inline directo (HTML de imports) se escribe como antes.
- **Harness de round-trip (`tests/lib/editorRoundTrip.test.ts`, entorno happy-dom).** Prueba el ciclo
  real de la app con el **esquema real** (`getSchema(schemaExtensions())`; `getSchema` no instancia
  NodeViews, así que importar los módulos React no molesta): cargar =
  `createDocument(htmlFromMarkdown(md), schema)` (lo que hace `Editor.tsx`), guardar =
  `htmlToMarkdown(getHTMLFromFragment(doc.content, schema))` (`helpers/editorPipeline.ts`).
  Invariantes: **(a) sin pérdida** — todo documento que el editor puede tener vuelve igual
  (`load(save(D))` igual a `D` y el markdown es punto fijo): fuzz de documentos generados con PRNG
  con semilla (`helpers/docFuzz.ts`: marcas, breaks al inicio/medio/final y rachas de 1-3, párrafos
  vacíos, headings, HR, código, citas, tablas, tableros, las tres listas anidadas hasta 3 niveles y
  mezcladas, atributos de tarea), más barridos exhaustivos de **todo par de tipos de bloque** en ambos
  órdenes con 0-2 breaks y de **listas anidadas de todo par de tipos** con 0-3 breaks; **(b) estable**
  — markdown arbitrario (líneas de toda sintaxis, también malformada, pegadas o separadas) llega a un
  punto fijo como mucho en el segundo guardado (nada crece) **sin perder texto** (`lostText`: las
  letras/dígitos del original, sin marcadores de lista, numeración, checkbox ni `>`, siguen todas;
  un punto fijo vacío no basta), y si no es ambiguo, en el primero y sin cambiar el documento; **(c)** secciones canónicas (`helpers/roundTripFixtures.ts`, incl. un trozo
  real de nota de trabajo) **byte a byte**. Más: tests de comandos de edición con un `Editor` de
  `@tiptap/core` real. Cómo ampliarlo: un bloque/marca nuevo → añadirlo al generador (`genBlock`/
  `inline`) y, si el formato no puede distinguirlo de otro documento, a `ambiguity()` **con comentario
  de por qué y en qué vuelve** (nunca relajar una aserción); un bug de "línea que vuelve" de una nota
  real → añadir la sección como fixture. `FUZZ_SEEDS=50000 npx vitest run
  tests/lib/editorRoundTrip.test.ts` para fuzz profundo en local (por defecto 4000 + 2000). Ojo:
  happy-dom mantiene vivos los documentos parseados hasta que corren sus tareas pendientes; los bucles
  largos hacen `await breathe()` cada 25 casos o el worker se queda sin memoria. El resto de la
  batería sigue en entorno node (`miniDom` para los tests que solo necesitan `htmlToMarkdown`).
- **Ambigüedades del formato (inherentes; no se arreglan sin cambiar el formato en disco, que
  comparten CLI y app móvil).** Documentos que se escriben igual que otro distinto; `ambiguity()` del
  harness los nombra uno a uno (mantener esta lista en sync):
  - **Dos listas del mismo tipo seguidas** (también anidadas) = una lista cuyo ítem acaba en break →
    vuelven como una lista.
  - **Línea en blanco dentro de un párrafo o ítem** (2+ breaks seguidos con texto detrás) = dos
    párrafos (en un ítem: la lista + un párrafo).
  - **Breaks finales antes de otro bloque:** 2+ = un párrafo vacío; 1 antes de un **párrafo** =
    break inicial de ese párrafo (`x<br>` + `y` ≡ `x` + `<br>y`, vuelve lo segundo). 2+ breaks
    iniciales en un párrafo que no es el primero = párrafo vacío. Igual al final de una cita.
  - **Ítem de nivel superior que acaba en 3+ breaks antes de su hermano** = lista + párrafo vacío +
    lista (en anidadas no hay límite: la indentación lo distingue).
  - **Viñeta vacía o que empieza por break, justo debajo de otra viñeta de su lista:** `- ` ahí se lee
    como línea en blanco (legado de la era YAML) → pasa a break del ítem de encima, y el texto que
    seguía se une a ese ítem (el texto no se pierde). Como primer ítem de su lista round-trippea.
  - **Hard break en un heading:** `# a\nb` es heading + párrafo para cualquier lector markdown (y en
    la salida del LLM), así que se escribe como espacio → vuelve el heading con su texto, sin el salto.
  - **Varios párrafos en un ítem o en una celda** → uno con breaks (el texto no cambia).
  - **Bordes del documento:** `htmlToMarkdown` hace `.trim()`: párrafos vacíos/breaks/espacios al
    inicio o al final se pierden; un ítem numerado o viñeta vacío como última línea pierde el espacio
    (`1.`, `-`) y vuelve como texto.
  - **Texto que parece sintaxis de bloque** en una línea de continuación (`# x`, `- x`, `1. x`,
    `> x`, ```` ``` ````, fila separadora bajo una línea con `|`, `<!--`, `---`): no hay escapes; se
    relee como ese bloque en cuanto deja de ir pegado a texto (p. ej. tras partirse un párrafo por una
    ambigüedad de arriba). También un marcador `<!-- kanban -->` de un tablero inválido que quedó como
    texto, aunque sea la primera línea: al guardar se normaliza lo de debajo (indentación de listas,
    líneas en blanco) y puede pasar a ser un tablero válido. Es lo que hace que markdown ambiguo
    necesite **dos** guardados para el punto fijo.
  - Otras, ya documentadas arriba: fences anidados, `++`/`==` literales, líneas en blanco al final de
    un bloque de código, espacios finales del código.
- Estos elementos son **markdown plano** en el cuerpo del `.md`: no tocan el frontmatter ni los tres
  espejos del formato (`noteUtils`/`noteFormat`/`cli`), así que sincronizan y se degradan limpio en
  editores externos/CLI.
- **⚠ Pendiente portar a móvil.** `noteflow-mobile/src/editor-web/converters.ts` es una copia línea
  a línea de `markdownHtml.ts` (su cabecera: los cambios se portan desde desktop como diff, y cualquier
  diferencia **reescribe las notas en silencio al guardar** desde el móvil). Los arreglos del
  round-trip de 2026-10 (lista-fantasma y siguientes) **no están portados**; hasta portarlos, el móvil
  puede reintroducir las líneas fantasma / mover texto en notas que el desktop ya escribe bien. Qué
  portar (sin tocar aquí el repo móvil):
  - `groupBlocks`/`continueList`/`listTail` y el agrupado por tipo de `renderMdListItems`.
  - `\n` impar: `attachTrailingBreak`, `ensureBlockStart` sin paridad y `codeBlockLines`.
  - Citas recursivas (`mdBlockquoteToHtml` + `quoteDepth`: sin tableros dentro) y el serializador de
    citas que quita solo el último separador.
  - Tablas: líneas pegadas bajo la tabla como bloque propio (`mdTableToHtml`) y `cellLines`/
    `isBlockCell` al serializar celdas.
  - Headings pegados (`mdParagraphBlockToHtml`), `headingElToMd` (breaks → espacio; heading vacío →
    párrafo vacío).
  - Tareas: `- [x](url)` no es tarea, `- [ ]foo` es viñeta; marcador vacío `emptyMarkerIsItem` y
    tabulador tras el marcador (`parseListLine`), `lead` de `parseMdListItems`.
  - Bloques de código: líneas en blanco finales descartadas al leer.
  - Esquema del editor web móvil: `listItem`/`taskItem` con contenido `paragraph+ list*` y
    Shift+Enter en heading = partir (si su editor lo permite).

### Editor: mapa de secciones (pestañas que bajan de fila)
Las pestañas de sección del editor no son una tira con scroll horizontal: son un **mapa de secciones**
(`Editor/SectionMap.tsx`, lógica pura en `src/lib/sectionMap.ts` con test en `tests/lib/sectionMap.test.ts`,
estilos `.section-map*` en `index.css`). Un único bloque `flex-wrap` (gap 4 px, `border-radius: 8px` +
`overflow: hidden`, así que solo se redondean las esquinas exteriores) que baja de fila como los
salientes de un archivador; las juntas dejan ver `--bg-editor` (la fila ya no tiene banda de fondo
propia). Lo usan los paneles del editor y la ventana de sección (`SectionWindowApp` monta
`NoteEditor`); **no** es `Sidebar/SectionTabsRow.tsx` (la fila con scroll de celdas `SectionCell` del
sidebar, del peek de grupo y de las tarjetas de las vistas generales, con su propia `.section-tabs-scroll`) ni el mapa de las filas de nota del sidebar
(`Sidebar/NoteSectionMap.tsx`, que imita su aspecto en pequeño y reutiliza `.section-map-corner` y
`resolveSectionInk`; ver "Sidebar: item de nota"). La **vista de nota** es el mismo bloque con la vista
previa dentro y comparte piezas con él (`.section-map-corner`, más grande allí, `.section-map-drop`,
`reorderDropSide`, `resolveSectionInk`): si cambias una, revisa también "Vista de nota (note overview)". Decisiones a
respetar si se toca:
- **Filas justificadas:** inactivas `flex: 1 1 auto`, activa `flex-grow: 2.6` → cada fila llena el
  ancho y el mapa es un rectángulo. Al cambiar de sección `flex-grow` transiciona 450 ms (color/fondo
  250 ms, `max-width` de la etiqueta 450 ms, el chevron entra con retraso); con
  `prefers-reduced-motion` no hay transiciones. **Solo se anima el crecimiento** de lo que alimenta
  el wrap (`max-width` del sizer y del chevron al *pasar a* activa); al dejar de serlo es instantáneo.
  Si ambos sentidos se animaran, durante la transición la antigua activa seguiría ancha mientras crece
  la nueva, la suma de bases superaría la final y el wrap podría sacar una fila de más (una 4.ª por
  encima del tope) durante ~450 ms. Coste: una antigua activa con título >150 px estrecha su base de
  golpe (el reparto de `flex-grow` sí sigue animado). El `+` es la última celda (`flex: 0 0 32px`, una sola
  instancia); las acciones (vista general, favorito, `⋯`) van fuera del bloque alineadas con la
  primera fila.
- **Ancho de la etiqueta por un "sizer" invisible**, no por el texto: un `<span>` oculto con
  `max-width` 150 px (340 px la activa) fija la base flex y el texto visible va `absolute` encima de
  toda la caja con elipsis. Así el texto usa todo el sitio que le da la fila justificada y el **hover
  no cambia la base** (si ensanchara la pestaña, la fila se re-partiría bajo el cursor y podría
  oscilar). El hover solo aclara el fondo y agranda la "esquina doblada".
- **Color:** `resolveGroupColor(nombre)` → `--sm-color` por pestaña (var del tema o hex). Inactivas:
  fondo `--text / 0.06` y un triángulo de 7 px (11 px en hover) en la esquina sup-dcha con el color;
  activa: fondo sólido del color. Su **tinta** (`--sm-ink`) la elige `resolveSectionInk()`
  (`lib/sectionInk.ts`, compartida con la vista de nota): lee del
  `getComputedStyle` de `<html>` el RGB del color (o parsea el hex) y de `--bg-0`/`--text`, y se queda
  con el de más contraste WCAG (`pickReadableInk`, empate → `--bg-0`). En temas oscuros sale `--bg-0`
  (tinta oscura) salvo colores muy oscuros; en claros depende del color (p. ej. ámbar de NoteFlow Light
  → `--text`). Se recalcula al cambiar tema/acento (suscripción a `themeStore`). Secciones
  ocultas a la IA: `EyeOff`, fondo más tenue y esquina gris (en la activa, color mezclado al 72 % con
  `--bg-editor`, también en el cálculo de contraste).
- **Tope de 3 filas** (`SECTION_MAP_MAX_ROWS`): el resto se pliega en una celda `+N more`; pulsarla
  despliega el bloque entero, con `Show less` al final para replegar. Estado `expanded` por instancia
  (el editor monta el mapa con `key={note.id}`, así que se repliega al cambiar de nota) y sin
  persistir. **Medición sin bucles:** una **capa invisible** (`.section-map-measure`, `width:0` +
  `overflow:hidden` con un hijo `width: max-content` sin wrap ni transiciones) pinta todas las pestañas a su ancho
  natural en su estado final, más `+N more` (con N = total, el más ancho posible) y `+`. En un
  `useLayoutEffect` (antes de pintar: sin parpadeo) se leen sus anchos y el del bloque y
  `planSectionMap()` **simula** el salto de línea de `flex-wrap` (voraz, con 0.5 px de holgura para
  errar hacia "no cabe": a lo sumo se pliega una pestaña de más, nunca sale una 4.ª fila). La capa no
  depende del plan y el ancho del bloque viene del padre, así que medir no realimenta. Un
  `ResizeObserver` sobre el bloque (ancho del panel) y la capa (fuentes que cargan tarde) re-mide; el
  `useLayoutEffect` re-mide solo con cambios que afectan al ancho (firma id+nombre+`aiHidden`, sección
  activa, renombrado, idioma), no al teclear. El mismo plan (con `maxRows: 2` y **sin** `addWidth`:
  opcional, sin pestaña `+` no se añade ningún elemento, ni siquiera de ancho 0, que costaría una junta)
  lo usa el mapa abierto de la fila del sidebar (ver "Sidebar: item de nota" → `open`).
- **Secciones fijadas:** la activa y la que se está renombrando nunca quedan plegadas
  (`visibleSectionIndices(total, pinned, count)`): si caen entre las ocultas ocupan los últimos huecos
  visibles — **solo visualmente**, el orden de los datos no cambia. Sin esto, renombrar desde el menú
  una pestaña cerca del tope (el input es más ancho) la plegaría y desmontaría el input.
- **Equilibrado de la última fila: no implementado.** Forzar cortes de fila en un único `flex-wrap`
  exige elementos de salto (`flex-basis:100%`), que con `row-gap` duplican la junta, o filas como
  contenedores separados, que remontan la pestaña al cambiar de fila (se pierde la transición y un
  doble clic puede caer en dos nodos distintos). La última fila puede quedar con 1–2 pestañas
  estiradas.
- **Arrastrar para reordenar** (estado local del mapa): el id va en una ref y el "hueco" visual
  (`is-dragging`: fondo muy tenue, contenido invisible) se pone un frame después, para que la imagen
  de arrastre se capture de la pestaña tal cual. El destino es una barra `--accent` de 4 px **en la
  junta** del lado donde caerá (`moveSectionInList` deja la arrastrada *después* del destino si viene
  de la izquierda y *antes* si viene de la derecha); si esa junta es el borde del bloque (que
  `overflow:hidden` recortaría) la barra va dentro de la pestaña. El bloque entero acepta el `dragover`
  (juntas, `+` y pills incluidas: el cursor no parpadea a "no soltar") y el `drop` confirma el último
  destino. **Un mapa plegado se despliega al empezar el arrastre** (un frame después del `dragstart`,
como el hueco): así el orden visual coincide con el de los datos (no hay activa adelantada cuya
junta no corresponda a su posición real), toda sección es destino y soltar no puede mandar la
pestaña a la zona plegada sin verse. Tras una soltada que reordena se queda desplegado (se ve dónde
cayó); si el arrastre se cancela se vuelve a plegar. El test de borde usa `getBoundingClientRect`
con 1.5 px de tolerancia (`offset*` redondean). Red de seguridad: `dragend` (capture) y
  `drop` (**bubble**: en capture correría antes del `onDrop` del bloque y borraría el arrastre que va
  a confirmar) en `window` limpian un arrastre que acabe fuera o cuyo tab origen se desmonte.
- **Chevron de la activa** (`margin-left:auto`): abre el mismo `NoteContextMenu` del click derecho,
  anclado bajo la pestaña; si ya está abierto para esa sección lo cierra (hace `stopPropagation`: el
  listener de `click` en `window` del menú lo cerraría y el propio click lo reabriría).
- **Renombrar inline** (doble clic): el input vive dentro de la pestaña, con fondo del color al 18 % y
  anillo interior de 1.5 px (`color-mix` con `--sm-color`, vale para var o hex); la pestaña deja de ser
  `draggable` mientras tanto (seleccionar texto con el ratón no debe arrastrarla).

### Editor: menú contextual de los tabs de sección
El click derecho en un tab (`NoteEditor.tsx`, estado `tabMenu`) abre el **`NoteContextMenu`
compartido** en modo sección (`sectionId` del tab, en `e.clientX/Y`) — el mismo del sidebar y las
vistas —, no un menú propio. (Antes era una franja desplegable bajo la tira con el nombre editable;
se eliminó junto con `SectionNameField`.) Decisiones:
- **`sectionActions`** (prop opcional de `NoteContextMenu`): el editor resuelve él mismo las acciones
  que dependen de su estado vivo — `rename` (activa el **renombrado inline del tab**, `renamingId`; solo
  se ofrece `Rename section` cuando hay `sectionActions`), `duplicate` (`handleDuplicateSection`:
  hace `flush` del buffer raw antes de duplicar y deja la copia activa **en ese panel**) y `delete`
  (`handleDeleteSection`: confirmación + toast de **Undo**). Sin la prop, el menú usa sus defaults
  (`duplicateSection` + `navigateToSection`, borrado sin undo). `standalone` (ventana de sección)
  oculta `Note overview` y `Open (section) alongside`, que necesitan el shell principal.
- **Escape:** el contenedor del panel hace `stopPropagation` en `onKeyDown`, así que el listener de
  `window` del menú no ve el Escape con el foco aún dentro del panel (el tab clicado o el editor): el
  `onKeyDown` del contenedor cierra `tabMenu` él mismo. Por lo mismo el menú se renderiza **fuera**
  del contenedor (junto a los modales).
- **Foco al cerrar** (`closeTabMenu`): en el siguiente frame, si el foco quedó "varado" (en `body` —
  la opción clicada se desmonta — o en una pestaña del mapa, p. ej. su chevron) vuelve al editor (TipTap o textarea raw); si
  algo se lo llevó (un modal, el título…) se respeta.
- **`Rename section` y el foco:** mientras el **input de renombrado** está montado (`renameRef.current`),
  `closeTabMenu` no devuelve el foco. El input se enfoca a sí mismo en un `setTimeout(0)`, así que en
  el frame de `closeTabMenu` el foco aún está en `body` (parece "varado"); y el `commands.focus()` de
  TipTap se difiere a su vez un frame, de modo que le robaría el foco al input ya enfocado → su
  `onBlur` guardaría y cerraría el renombrado (y lo tecleado iría al cuerpo de la nota).
- **Fin del renombrado inline:** Enter / ✓ / blur guardan y Esc cancela; todos devuelven el foco al
  cuerpo (`focusEditorBody`: TipTap o textarea raw). `renameOpenRef` hace que solo el primero cuente:
  el `onBlur` del input aún puede dispararse con el borrador al desmontarse o al irse el foco al editor,
  y no debe guardar tras un Esc ni guardar dos veces. Toda entrada al renombrado (doble clic, menú,
  `+`, `Ctrl+T`) pasa por `openRename` y toda salida (guardar, cancelar, cambio de nota, sección
  activa borrada) por `closeRename`, que mantienen la ref en sintonía con `renamingId`: no usar
  `setRenamingId` a pelo (una sección nueva no podría guardar su nombre). Cambio de nota o sección
  activa borrada con el input abierto **descartan** el borrador (con ratón no pasa: el click fuera
  hace blur y guarda antes del cambio).
- No se abre sobre el **input de renombrado** de un tab: el nombre aún no está guardado y los colores
  van por nombre de sección.
- El input de renombrado inline lleva `OWN_KEYS_PROPS` (`data-own-keys`, `src/lib/keyScope.ts`): los
  atajos globales de `App.tsx`/`SectionWindowApp.tsx` y el `Ctrl+Tab` de `NoteEditor` son listeners de
  `window` en **capture** (ven la tecla antes que el campo) y salen con `ownsKeys(e.target)`.
  Reutilizable para cualquier campo que deba "quedarse" sus teclas.

### Editor: hueco bajo el caret al escribir cerca del borde
El editor TipTap (`Editor.tsx`) fija `editorProps.scrollThreshold` y `scrollMargin` con el **mismo
valor** vertical (`DEFAULT_CARET_SCROLL_GAP` = 40 px arriba / 96 px abajo). Por defecto ProseMirror
usa threshold 0 / margin 5 px: al teclear o pulsar Enter en la última línea visible solo scrollea lo
justo para ver el caret, que queda pegado al borde inferior (el `padding-bottom: 12rem` de
`.prose-editor .ProseMirror` sí cuenta en el alto de scroll, pero solo se veía scrolleando a mano).
- **threshold === margin** a propósito: en cuanto el caret entra en la franja, scrollea línea a línea
  manteniendo el hueco. Un margin mayor que el threshold haría saltar el contenido de golpe.
- Solo afecta a transacciones con `scrollIntoView()` (teclear, Enter, flechas, pegar, undo); los
  clicks de ratón no scrollean. La búsqueda en nota **no** depende de esto (el foco está en su input;
  centra el match a mano, ver "Búsqueda en nota").
- El `padding-bottom` del `.ProseMirror` debe ser **mayor** que el gap inferior; si no, al final del
  documento el scroll se clampa antes y el hueco no se alcanza.
- La ventana **sticky** pasa un gap compacto vía prop `caretScrollGap` (`STICKY_CARET_SCROLL_GAP` =
  8/32 px en `StickyApp.tsx`, con `.sticky-editor .ProseMirror` a `padding-bottom: 2.5rem`): en una
  ventana de 200–300 px las franjas de 40+96 px casi se solaparían.

### Editor: autocierre de paréntesis
Extensión `components/Editor/AutoCloseBrackets.ts` (registrada en `Editor.tsx`) que envuelve el plugin
de `src/lib/autoCloseBrackets.ts`; toda la lógica vive en el lib, sin DOM, para testearla contra un
`EditorState` pelado (`tests/lib/autoCloseBrackets.test.ts`). Solo `()`.
- `(` vía `handleTextInput`: selección vacía → `()` con el caret dentro (no si el carácter siguiente
  es letra/dígito, `shouldAutoClose`); selección de texto dentro de un mismo textblock → la envuelve y
  la mantiene seleccionada. Cada caso es **una transacción** (un `Ctrl+Z`).
- **Solo los `)` autoinsertados** se saltan al teclear `)` o se borran en pareja con Backspace en
  `(|)`: el plugin guarda cada par como `{open, close}` (posiciones del `(` y del `)`, mapeadas por
  cada transacción con assoc 1) y lo olvida en cuanto deja de estar "vivo": el caret sale del par por
  cualquier lado (queda fuera de `[open+1, close]`), hay selección, el `(` y el `)` ya no están en el
  mismo textblock, o cualquiera de los dos desaparece. Lo borrado se detecta **releyendo el carácter**
  en la posición mapeada (`mapResult().deletedAfter` no sirve: también marca una inserción pura en esa
  posición, p. ej. escribir justo tras el `(`). Así un `)` escrito a mano, pegado o restaurado por undo
  nunca se salta ni se borra, ni tampoco uno cuyo `(` se haya borrado (`ab(|)` → `Supr` sobre el `(`
  → `ab|)` → teclear `)` da `ab))`).
- Backspace va por `addKeyboardShortcuts` con `priority: 200` (por encima del keymap core, prioridad
  100); solo actúa dentro de un par vacío autoinsertado.
- Aplica **en todas partes**, también bloques de código y código inline (donde más se usan los
  paréntesis). No actúa durante composición IME (`view.composing`); con Ctrl/Meta no llega
  `handleTextInput`. No choca con el `/` de `SlashCommands`.
- **Input rules:** el plugin de input rules de TipTap va **siempre antes** que cualquier plugin de
  extensión en `handleTextInput`. Ninguna regla termina en `(`, pero la de imagen (`![alt](src)`)
  termina en `)`: al teclear ese `)` delante del autoinsertado, la regla se lo come antes de que
  nuestro salto actúe y dejaría el `)` colgando tras la imagen. `dropClosedByInputRule`
  (`appendTransaction`) lo borra: detecta la transacción de la regla por su meta (clave = el plugin
  con `spec.isInputRules`, `text: ')'`). Al ser transacción anexada, el historial la agrupa con la
  regla (un `Ctrl+Z`). Efecto lateral menor: como la transacción anexada cambia el doc, el estado del
  plugin de input rules se resetea y **Backspace ya no revierte la imagen** a texto (`undoInputRule`)
  en ese caso; `Ctrl+Z` sí.

### Editor: fragmentos (botón partido del toolbar + menú `/`)
Contenido reutilizable que el usuario configura y se inserta en el cursor desde el toolbar
(`Editor/SnippetsButton.tsx` + `SnippetsModal.tsx`; lógica pura en `lib/snippets.ts`, tests en
`tests/lib/snippets.test.ts` y `tests/lib/snippetInsert.test.ts`). Persistencia en `snippets.json`
(ver `architecture.md`); UX en la skill `noteflow-features`.
- **Variables:** `{date:FORMATO}`, `{time:FORMATO}` y `{datetime:FORMATO}` formatean **el mismo
  instante** (el del clic); solo cambia el formato por defecto sin `:FORMATO` (o con `{date:}` vacío):
  `DD-MM-YYYY`, `HH:mm`, `DD-MM-YYYY HH:mm`. Cualquier otra `{…}` se deja tal cual (no hay escape: el
  único caso afectado es querer escribir literalmente `{date}`). El formato no puede contener llaves.
- **Formato estilo moment/dayjs con tokenizador propio** (`formatDateToken`), no los tokens de date-fns
  (donde `dd`, `D` o `YYYY` significan otra cosa): `YYYY YY MMMM MMM MM M DD D dddd ddd HH H hh h mm m
  ss s A a`, texto literal entre `[corchetes]`, cualquier otro carácter se copia. Coincidencia más
  larga primero. `yyyy`/`yy` en minúscula se aceptan como alias del año (`y` no significa nada más
  aquí). **`MM` = mes, `mm` = minutos**: la leyenda del modal lo avisa y la vista previa en vivo lo hace
  evidente ("dddd-mm-yy" da minutos).
- **Nombres de día/mes = tablas estáticas EN/ES** por idioma de la UI (`languageStore.lang`), no
  `Intl.DateTimeFormat`: la salida debe ser idéntica en cualquier build de ICU (los meses cortos en
  español varían entre "sept"/"sep" y con o sin punto) y testeable. Español en minúscula ("sábado,
  7 de noviembre"); AM/PM igual en los dos idiomas.
- **Inserción** (`snippetCommands.ts`): el texto expandido sigue el mismo camino que pegar markdown
  (`htmlFromMarkdown` → `DOMParser.parseSlice` → `replaceSelection`), así encabezados, listas y
  checkboxes se renderizan. Una sola línea sin sintaxis de bloque (`isInlineSnippet`) entra como
  **slice inline abierto** — se une al texto del cursor en vez de partir el párrafo — conservando los
  espacios de los bordes, que el parseo recorta. Un fragmento de bloques que acaba en línea en blanco
  añade un párrafo vacío final para que el caret quede debajo (p. ej. bajo el encabezado del diario).
  Dentro de un bloque de código entra como texto plano (misma regla que el pegado). El toolbar no existe
  en Modo texto (`isRawMode`) ni en solo lectura/stickies, así que no hay rama para el textarea crudo.
- **También en el menú `/`** (`SlashCommands.ts`): tras los comandos integrados, bajo un encabezado
  *Snippets* (no es item: ↑/↓ solo recorren `items`) y con el icono `Stamp` del toolbar, van los
  fragmentos en el orden configurado. Lógica pura en `lib/slashItems.ts` (`filterSlashItems` = la regla
  de filtro de siempre: subcadena del título o keyword que empieza por la consulta;
  `snippetSlashEntries`), tests en `tests/lib/slashItems.test.ts`. Filtran por nombre (contenido del
  usuario, sin traducir) y con las keywords sin traducir `snippets`/`fragmentos` (`/snippet`,
  `/fragmento` listan todos en cualquier idioma). Los de contenido en blanco se omiten; sin nombre
  muestran *Untitled snippet*. La descripción es `snippetPreviewLine` en el momento de abrir y la
  inserción reexpande con `new Date()` y llama al mismo `insertSnippet` que el botón (por eso su tipo
  `Editor` es el de `@tiptap/core`). La lista y el idioma se leen de los stores en cada pulsación, y la
  extensión hace `ensureLoaded()` en su `onCreate`: el botón del toolbar es configurable y puede estar
  oculto, así que no se depende de que monte. `SlashCommandItem.id` es la key de React (los títulos se
  repiten: dos fragmentos con el mismo nombre, o uno llamado como un comando). El popup tiene
  `max-height` con scroll y la selección se mantiene visible. Como todo `/`, solo en Modo markdown.
- **Modal portalizado dentro del árbol del editor:** los eventos React burbujean igualmente hasta
  `Editor.tsx`/`NoteEditor.tsx` (Enter tras un `<hr>`, pegado de imágenes, atajos del panel), así que la
  raíz del modal para `keydown`/`paste`/`drop` y lleva `OWN_KEYS_PROPS`; Escape va por un listener de
  `window` en captura.
- **Sin siembra inicial:** con la lista vacía el clic principal abre el modal, con las sugerencias a la
  vista. Sembrar "Fecha de hoy" duplicaría la entrada al fusionar dos dispositivos (ids distintos) y
  volvería tras borrarla. Las sugerencias se copian en el idioma actual al añadirlas (nombre y textos
  internos como "Asistentes"); luego son contenido del usuario.
- **Autoguardado** (`snippetsStore`): cambios estructurales (añadir, borrar, reordenar, por defecto) se
  escriben al instante; lo tecleado en el modal con debounce de 400 ms y `flush()` al cerrar.
  **Merge al recargar** (`snippets-updated` o pull): manda la lista de disco (orden, altas, bajas, por
  defecto — lo estructural ya se escribió al instante) y encima se re-aplican solo los campos
  `name`/`content` tecleados aún sin escribir (`pendingEdits` → `applyPendingEdits`, puro y testeado; una
  edición de un fragmento borrado en otro lado se descarta); la escritura con debounce pendiente guarda
  luego ese resultado fusionado. Nunca al revés: descartar el reload y escribir la lista local pisaría (y
  subiría) los cambios de la otra ventana o del remoto. Cada patch se borra de `pendingEdits` solo cuando
  su escritura aterriza, y una lectura que se solapa con una escritura propia (podría ser anterior a ella)
  se descarta y se repite al terminar las escrituras. `snippets:set` en main ignora un payload que no sea
  array (no vacía el fichero). El store se carga perezosamente con el primer editor rich que se crea
  en la ventana (`onCreate` de `SlashCommands`: ventana principal, de sección y stickies) o con el botón
  del toolbar, lo que llegue antes, y esa primera carga se suscribe a `snippets-updated` y al
  `notes-updated` sin ruta de los pulls.

### Búsqueda en nota (Ctrl+F): el match activo se centra
Al escribir la consulta / cambiar mayúsculas (si hay match) y en cada next/prev, el match activo queda
**centrado verticalmente** en el área de scroll del editor (el navegador clampa al principio/final).
- **Rich** (`InNoteSearchBar.tsx`): `centerInScroller` mide el `.nf-search-match-active` (decoración
  de ProseMirror o `<span>` pintado por un tablero kanban) contra el scroller que expone
  `EditorHandle.getScrollContainer()` y ajusta su `scrollTop`; los scrollers horizontales intermedios
  (`.kanban-scroll`, `pre` de código) se desplazan lo justo para mostrarlo. Se hace a mano, en un rAF
  (el tablero pinta el activo vía React), y **sin `scrollIntoView()`**, que también movería ancestros
  `overflow: hidden`. El `tr.scrollIntoView()` de `selectMatch` no sirve: el foco está en el input y
  solo llevaría el match al borde.
- **Raw** (`RawNoteSearchBar.tsx`): el resaltado es un **div espejo** (`position: absolute`, texto
  transparente, `<mark>`s en los offsets del match) bajo el `<textarea>` transparente. La posición del
  match se **mide** en el espejo (`offsetTop`/`offsetHeight` del `<mark>` activo; el espejo es su
  `offsetParent`, mismo espacio que `textarea.scrollTop`) en un `useLayoutEffect` tras regenerar su
  HTML — nada de contar `\n` × alto de línea, que falla con líneas que hacen wrap. Para que el espejo
  haga wrap igual que el textarea: copia sus estilos de texto/padding/borde, suma el **ancho del
  scrollbar** del textarea a su `padding-right` (el espejo es `overflow: hidden` y no lo tiene) y
  termina en un `\u200b` (un `\n` final crea línea en el textarea pero no en un div `pre-wrap`).
  Re-casar tras editar el texto **no** salta al primer match: solo una consulta/case nuevos lo hacen.

### Editor: índice flotante (table of contents)
Índice estilo Notion de los **H1–H3** de la sección abierta, en el borde derecho del área de scroll
del editor rich. Piezas: `lib/tocUtils.ts` (lógica pura con tests en `tests/lib/tocUtils.test.ts`:
`buildTocItems`, `pickActiveHeading`, `pickIndicatorDashes`, `activeDashIndex`, constantes de tamaño),
`Editor/useEditorToc.ts` (`readTocItems(doc)` + hook `useTocItems`) y `Editor/EditorToc.tsx` (UI).
- **Dos estados.** En reposo solo se ve un **indicador**: una columna de rayitas (una por encabezado,
  16/11/7 px según el nivel relativo; la del activo en `bg-text`, el resto `text-muted/50`). Hover
  (retardo de apertura 90 ms para no saltar al ir hacia el scrollbar) o foco de teclado
  (`focus-within`) despliega un **panel de 272 px que se superpone al texto** (`bg-surface-1`,
  borde y sombra; transición de opacidad + desplazamiento); se recoge al salir con 160 ms de retardo
  (sin parpadeo al pasar del indicador al panel, que lo tapa). Escape devuelve el foco al editor. El
  indicador es un `button` con `aria-expanded`/`aria-controls`; el `nav` lleva `aria-label`.
- **Panel:** entradas con jerarquía tipográfica por nivel absoluto (14/13/12 px, H1 `font-medium`) y
  sangría por nivel relativo; el **activo va en negrita** (`text-text`), no con el color de acento;
  truncado con elipsis + `title`. Scroll interno propio si es largo.
- **Muchos encabezados:** como máximo `TOC_MAX_DASHES` (40) rayitas — se descartan primero H3, luego
  H2, y si los de nivel superior aún no caben se muestrean uniformemente; la rayita activa es la del
  encabezado activo o la anterior más cercana mostrada. El hueco entre rayitas se compacta (7→4 px)
  a partir de 20.
- **Opt-in por prop** `showToc` de `Editor` (default `false`): solo `NoteEditor` lo pasa (desde el
  ajuste), así sale en el editor principal, en cada panel del split y en la ventana de sección
  (`SectionWindowApp` monta `NoteEditor`), y **no** en stickies (`StickyApp` usa `Editor` sin la prop).
  En modo texto (`isRawMode`) no existe (`NoteEditor` renderiza el textarea en vez de `Editor`).
- **Ajuste** Settings → Editor → "Table of contents" (switch), **activado por defecto**. Vive en
  `editorSettingsStore.showToc` y se **sincroniza** en `ui-settings.json` (`editor.showToc`, saneado en
  `electron/uiSettings.ts` **y en su espejo de noteflow-mobile**) como sus vecinos; sin clave legacy
  en localStorage (nació con el fichero sincronizado): ausente = mostrado.
- **Extracción:** `doc.descendants` sin bajar a textblocks (barato en notas grandes); vacíos y
  niveles fuera de 1–3 se descartan; la sangría es relativa al nivel más alto presente (una sección
  solo con H2/H3 empieza sin sangría). Se recalcula en cualquier transacción con `docChanged`
  (debounce 200 ms) — no en el evento `update`, que la transacción del sync externo (`preventUpdate`) no emite —
  y solo re-renderiza si cambia la firma (`tocSignature`).
- **Reserva de espacio solo para el indicador:** el scroller recibe `.editor-has-toc` y
  `--toc-reserve` (`TOC_RESERVE` = 44 px) e `index.css` lo convierte en `padding-right` del
  `.ProseMirror` vía la var `--pm-pad-r` (y `--pm-bleed-r: 0`, para que los tableros kanban a sangre
  tampoco pasen por debajo) — en reposo nada pasa bajo las rayitas; el panel desplegado sí tapa, a
  propósito. En **Readable** el `padding-left` (`--pm-pad-l`) crece hasta el mismo valor (`clamp(1.5rem, 100cqw - reserve - col,
  reserve)`) para que la columna siga centrada; las acciones de tarea siguen saliendo al margen
  derecho pero su borde derecho se acota contra `--toc-reserve` en vez del borde del editor. Bajo
  **420 px** de ancho del scroller (`TOC_MIN_EDITOR_WIDTH`, `ResizeObserver`; paneles muy estrechos)
  se oculta: el panel taparía casi todo. Sin encabezados tampoco se muestra.
- **Posición:** `absolute` dentro de un wrapper `relative` que envuelve al scroller (hermano, no hijo:
  no se mueve con el scroll), a 10 px del borde (libra el scrollbar). Solo tokens del tema.
- **Activo y salto:** en cada scroll (rAF) se miden los `view.nodeDOM(pos)` de los encabezados y
  `pickActiveHeading` elige el último cuyo top cruzó 64 px desde arriba (al fondo del scroll, el
  último visible). Click → `scroller.scrollTo({ behavior: 'smooth' })` dejando el heading a 16 px del
  borde; durante ese scroll programático la medición se congela hasta `scrollend` (sin parpadeo del
  resaltado). El panel sigue abierto mientras el ratón esté encima. `mousedown` hace
  `preventDefault` (entradas e indicador) para no robar el foco/caret al editor ni dejar el panel
  abierto por `focus-within` tras un click. El auto-scroll del panel hacia la entrada activa se hace a
  mano (`scrollIntoView` scrollearía también los ancestros `overflow-hidden` del editor).

### Sidebar flotante (mini-vista + panel superpuesto)
Dos modos del sidebar en la vista normal: **fijado** (en el layout, como siempre) y **flotante**.
Piezas: `lib/miniSidebar.ts` (lógica pura con tests en `tests/lib/miniSidebar.test.ts`),
`Sidebar/SidebarShell.tsx` (alojamiento + hover/foco/drag + medición), `Sidebar/MiniSidebar.tsx`
(dibujo) y `Sidebar/sidebarAnchor.ts` (anclas de contenido).
- **Un solo `Sidebar`, sin remontar.** `SidebarShell` monta siempre la misma instancia en un `aside`
  absoluto dentro de la fila de `App` (`contentRowRef`); el elemento del `Sidebar` (render-prop de
  `App`) va memoizado, así los cambios de hover/foco/medición del shell no re-renderizan la lista. Fijado = un *spacer* en el flujo reserva el
  ancho (transición de `width` 220 ms, igual que antes) y el `aside` va encima a altura completa;
  flotante = el spacer pasa a 0 y el mismo `aside` se convierte en panel (`sidebarWidth` de ancho,
  **toda la altura de la fila** con un inset de 8 px a izquierda/arriba/abajo (`PANEL_INSET`), borde
  redondeado/sombra tipo TOC, `z-index` 40, entrada opacity + translate-x 150 ms). El panel
  es **hermano** de `<main>`, no hijo: así los drops dentro del sidebar no burbujean al handler de
  "soltar en el editor → split" de `main`.
- **Interruptor.** El botón `PanelLeftClose`/`PanelLeftOpen` junto al buscador es un switch
  (`aria-pressed` = fijado, `aria-label` fijo "Pin sidebar", tooltip según estado). `Ctrl+'` alterna
  el modo. Ya no existe la columna de 28 px con `PanelLeftOpen`; para volver a fijar se abre el panel
  y se pulsa el switch. **La vista cerebro no cambia:** su sidebar se muestra/oculta con
  `brainSidebarVisible` (y su columna de 24 px), nunca flota; ahí el botón es un "Collapse" normal
  (`hideOnly`: sin `aria-pressed`).
- **Persistencia:** `settings.json → uiState.sidebarMode` (`'pinned' | 'floating'`, local, no
  sincroniza). Arranca fijado hasta que llega `getUiState`; las transiciones del shell están
  desactivadas hasta entonces (`sidebarAnimate`) para que un arranque flotante no reproduzca el plegado.
- **Posición vertical medida (solo la mini-vista).** La franja de la mini-vista ocupa solo la **zona de
  contenido** del pane más a la izquierda: su top/bottom salen del **ancla de contenido** visible más a
  la izquierda (`pickSidebarAnchor` + `floatingSidebarBounds`, inset 12 px como el TOC, altura mínima
  240 px). El **panel no usa esa medición**: abierto cubre toda la fila de contenido (bajo la TitleBar,
  la misma zona que el sidebar fijado), tapando también pestañas/título/toolbar del pane izquierdo.
  Anclas (`data-sidebar-anchor` + callback ref estable `sidebarAnchorRef`): el wrapper del scroller de
  `Editor` (debajo de la toolbar → recoge su alto variable), el textarea raw de `NoteEditor` y el
  cuerpo con scroll de `NoteOverview` y las tres columnas de `ContentView` (debajo de su cabecera).
  Sin ancla (cargando, sin nota, nota cifrada bloqueada) → toda la fila. Se re-mide (rAF) con un
  `ResizeObserver` sobre la fila y sobre el ancla elegida (toolbar que pasa a 2 filas, banners encima,
  hint de overflow del split, animación del spacer…), al montar/desmontar un ancla (el callback ref
  avisa: cambio de vista, raw, nota/sección) y con el scroll horizontal del split (scroll en captura,
  ignorando el de dentro de anclas y del sidebar). **No** hay MutationObserver sobre el editor.
- **Apertura/cierre.** Hover sobre la franja de 24 px (`MINI_STRIP_WIDTH`) del borde izquierdo:
  abre a los 120 ms (más que el TOC, para no saltar al seleccionar texto pegado al borde; con un botón
  pulsado — selección en curso — no abre); click en la franja abre ya. Sale del panel/franja → cierra a
  los 200 ms. Sigue abierto mientras: el ratón está encima; hay foco de **texto o teclado** dentro
  (inputs de búsqueda/rename/nuevo grupo-carpeta o `:focus-visible`; el foco que deja un click en un
  botón no cuenta, si no el panel no cerraría tras pulsar una cabecera; Chromium no emite `blur` si el
  input enfocado se desmonta — rename confirmado con Enter —, así que el `MutationObserver` de abajo
  suelta el foco si `document.activeElement` ya no está dentro); hay un `.fixed` dentro
  (menús contextuales, `ConfirmModal`, `EncryptionModal`… — `MutationObserver` sobre el `aside` que
  solo re-comprueba si se inserta/quita un elemento que es o contiene un `.fixed`); o hay un **drag**
  iniciado en él (el `dragend` puede no llegar si el drop re-parenta la fila, así que también cierran
  el drag un `drop` en cualquier sitio y el primer `mousemove` posterior; al terminar, queda abierto
  solo si el punto final está sobre el panel). Escape (salvo en un input de rename, o con un menú
  abierto) cierra y devuelve el foco al editor del pane activo (`focusContentAnchor`) y hace
  `stopPropagation` (si no, el Escape global — listener de `window` en burbuja — de `ContentView`/`NoteOverview` cerraría la vista); la franja no
  reabre hasta que el ratón sale de ella. Seleccionar una nota no lo cierra.
- **Watchdog de hover.** El `hovered` sale de `onMouseEnter/Leave` del `aside`, que React deriva de
  pares `mouseout`/`mouseover`; si se elimina el nodo bajo el puntero (nota pulsada en el peek de grupo,
  portaleado a `<body>`) no hay `mouseout` y el leave no llega nunca. Mientras `floating && hovered`, un
  listener de `mouseover`/`mousemove` en `window` (captura, pasivo) programa el cierre de 200 ms si el
  target no está en el `aside`, la franja ni un `[data-sidebar-portal]`; volver dentro cancela solo el
  temporizador que programó él (no interfiere con el cruce franja↔panel ni con el leave normal).
  Drag/overlay/foco siguen manteniéndolo abierto por su cuenta (`open` es un OR).
- **Abierto/cerrado sin `visibility`.** Cerrado = `opacity: 0` + `pointer-events: none` (sigue
  enfocable): `Ctrl+Shift+F` (`noteflow:focus-search`) enfoca el buscador aunque esté cerrado y el
  foco lo abre; Tab desde fuera también. Abierto usa `transform: none` (no `translateX(0)`): un
  ancestro transformado sería el *containing block* de los menús/modales `fixed` del sidebar.
- **Scroll solo de la lista.** En ambos modos solo la lista (`notes-list-scroll`) hace scroll; buscador,
  botones de nueva nota/grupo y footer quedan fijos. La única diferencia visual del flotante en `Sidebar`
  (`pinned=false`) es que no lleva `border-r` (el `aside` flotante dibuja su propio borde). Como el
  elemento que scrollea es el mismo, el scroll de la lista se conserva al cambiar de modo.
- **Mini-vista.** Sin texto, una fila por fila real del sidebar, en el mismo orden
  (`buildMiniSidebarRows`, que comparte con `Sidebar` `orderFavorites`/`isSidebarGroupShown`/
  `isSidebarFolderShown` → mismos filtros, archivados y colapsados): nota = rectángulo `text` muy
  tenue con micro-rectángulos de los colores de sus 3 primeras secciones (la activa más marcada; la
  activa es `noteViewId ?? activeNoteId`, como en el sidebar); grupo = pastilla de su color (más corta
  si está colapsado); carpeta = cuadradito contorneado (relleno si colapsada); cabeceras
  (favorites/groups/notes) = línea fina; sus filas hijas llevan un segmento de línea guía del color del
  grupo. Filas de 7 px + 4 px de hueco; si no caben, ventana centrada en la nota activa
  (`miniSidebarWindow`, sin scroll). Franja `opacity-40` en reposo, `90` con hover, 0 con el panel
  abierto; `aria-hidden` (lo accesible es el panel).
- **Reserva a la izquierda.** Con el sidebar flotante `<main>` lleva `.sidebar-floating` y
  `--mini-sidebar-reserve` (`MINI_SIDEBAR_RESERVE` = 34 px); `index.css` lo aplica como
  `--pm-pad-l` del `.ProseMirror` del editor real (`.editor-scroll > .prose-editor`; en Readable + TOC,
  como suelo del mismo `clamp`) y como `padding-left` del textarea raw (`.raw-editor`), así nada de
  texto queda bajo la mini-vista. Las previews `.note-preview` (vista de nota, hover, cerebro; también
  `.prose-editor`) quedan fuera a propósito. Esas previews se pintan fuera del contenedor del editor, así
  que definen ellas mismas `--prose-font-family` con `proseFontStack()` (la vista de nota en `.note-grid`,
  la tarjeta de preview de hover y cerebro en `.section-hover-card`, el panel de la vista de contenido
  en su `.note-preview`) para seguir
  el ajuste de fuente del editor.
  Es el espejo izquierdo de `--toc-reserve`; se aplica a todos los panes (en el split solo el primero
  la necesita, la diferencia es de 10 px).

### Peek de grupo colapsado (`Sidebar/GroupPeek.tsx`, `lib/groupPeek.ts`)
Hover ~400 ms sobre la cabecera de un **grupo colapsado** con ≥1 nota visible → ventanita a la derecha
del sidebar con sus notas (carpetas aplanadas) y un buscador que **toma el foco**. Lógica pura con tests
en `tests/lib/groupPeek.test.ts`: `flattenGroupPeekEntries` (sueltas primero, luego cada carpeta, en el
orden del sidebar; cada entrada lleva su carpeta o `null`), `filterGroupPeekEntries` (=`noteMatchesQuery`
+ `parseSearchQuery`: caché de índice, `#sección` incluido; query vacía → mismo array),
`moveGroupPeekSelection` (↑/↓ con wrap) y `groupPeekPosition` (borde derecho del sidebar + 6 px, top =
cabecera, clamp al viewport: sube si no cabe abajo).
- **Datos:** usa el `item` de grupo que ya deriva `Sidebar` (`useSidebarGroups`), así respeta búsqueda/
  tag/archivados sin recalcular. Las filas son un `PeekRow` memoizado (título 11.5 px + fecha, etiqueta
  `Folder`+nombre de carpeta si viene de una; secciones según el ajuste "Sections in the sidebar", como el
  sidebar y en compacto, ver "Sidebar: item de nota" → `GroupPeek`). Clicks = los
  `rowHandlers` estables del sidebar (`click`/`sectionClick`: Ctrl/Cmd → split; si no, editor en la
  primera sección / en esa sección…); `RowHandlers.click` acepta también `KeyboardEvent` porque Enter lo reutiliza.
  `formatNoteDate`/`renderHighlightedText` viven en `Sidebar/rowText.tsx` (compartidos).
- **Rendimiento:** el estado abierto/cerrado vive en `GroupPeek` (montado una vez en `Sidebar`); las
  cabeceras solo reciben `onPeekHover`/`onPeekLeave` estables (`useCallback([])` → `peekRef`, un
  `useImperativeHandle`). Mover el ratón no re-renderiza el sidebar; cerrado, `GroupPeek` devuelve
  `null` sin calcular nada. El panel interno (`GroupPeekPanel`, `key` = grupo) tiene query/selección
  locales y se mide **una vez** en `useLayoutEffect` (oculto hasta entonces; la altura sin filtrar es la
  máxima, así no salta al teclear). Entrada con el keyframe `group-peek-in` (tailwind, 120 ms).
- **Apertura:** temporizador desde el `mouseenter` (y `mousemove`, que re-arma); no abre si el grupo no
  está colapsado/está vacío, ni con `blocked` (drag de grupo, cualquier
  menú contextual o modal del sidebar, rename/nuevo grupo-carpeta). **Abre también con la ventana sin
  foco** (otra app en primer plano y NoteFlow visible), igual que el sidebar flotante: no hay
  comprobación de `document.hasFocus()`; el `focus()` del buscador ahí solo mueve el foco del DOM, no
  activa la ventana. A cambio, el `blur` de la ventana cancela también el temporizador pendiente (si no,
  un Alt+Tab con el ratón parado sobre una cabecera abriría el peek a espaldas del usuario; mover el
  ratón lo re-arma). Cualquier **tecla** cancela el
  temporizador pendiente: si el usuario escribe en el editor con el ratón parado sobre una cabecera, el
  peek no le roba el foco a mitad de frase (moverlo de nuevo lo re-arma). Tras un click o un cierre con
  el puntero aún en la cabecera, esa cabecera no reabre hasta que el ratón sale (`suppressRef`).
- **Cierre:** salir de cabecera+peek → 250 ms de gracia (cruzar el hueco; volver a la cabecera lo
  cancela; pasar a otra cabecera colapsada cambia de peek). Si el usuario **teclea o usa ↑/↓** en el
  buscador queda **anclado**: solo cierra con click fuera, Esc o navegación. También cierra al abrir
  nota/sección (desde él o desde cualquier sitio: `useNotesStore.subscribe` sobre activeNoteId/
  noteViewId/contentPlace/brain), scroll dentro del sidebar, blur/resize de la ventana o `dragstart`.
  Si el grupo se expande/vacía o el sidebar pasa a `blocked`, se descarta en render.
- **Foco:** guarda `document.activeElement` al abrir y lo devuelve al cerrar por ratón-fuera/Esc/
  dismiss (`focus({preventScroll})`; ProseMirror re-aplica su selección al recibir el foco, así que el
  caret se conserva). Click fuera: se devuelve **después** del click y solo si no se llevó el foco a
  otro sitio. Navegar no lo devuelve. Siempre se hace `blur()` del input **antes** de desmontar
  (Chromium no emite `blur` al quitar el elemento enfocado; el sidebar flotante seguiría contando foco
  dentro); el cleanup del panel hace lo mismo como red de seguridad. Esc hace `stopPropagation` (no cierra
  el sidebar flotante ni la overview abierta).
- **Portal + sidebar flotante:** portal a `document.body` con `position: fixed` (el panel flotante puede
  estar transformado → sería containing block). Como los eventos React burbujean por el **árbol React**
  (no el DOM), el hover (`onMouseEnter/Leave` del `aside`) y el foco (`onFocus`/`onBlur`) del peek cuentan
  como "dentro" para `SidebarShell`: el panel flotante no se cierra mientras se usa el peek. El hueco de
  6 px dispara un leave del `aside`, pero el enter del peek cancela su cierre (200 ms). El panel del peek
  lleva `data-sidebar-portal` (`SIDEBAR_PORTAL_ATTR` en `sidebarAnchor.ts`) para el *watchdog* de hover
  del shell (ver "Sidebar flotante"): al pulsar una nota del peek este se desmonta bajo el puntero, el
  navegador no emite `mouseout` de un nodo eliminado y React nunca entrega el `mouseleave` del `aside`.

### Sidebar: item de nota (mapa plegado + despliegue)
Las secciones de cada fila de nota del sidebar (`NoteRow` en `Sidebar.tsx`) las pinta
`Sidebar/NoteSectionMap.tsx` (estilos `.nsm-*` en `index.css`; lógica pura en `src/lib/sectionLine.ts`
y `sectionSearchMatch` en `searchUtils.ts`, con tests en `tests/lib/sectionLine.test.ts` y
`searchUtils.test.ts`). Habla el mismo lenguaje que el mapa de secciones del editor: cada celda es un
`Sidebar/SectionCell.tsx` (fondo neutro `--text/0.065`, la esquina plegada `.section-map-corner` del
editor en pequeño, la abierta en sólido con la tinta de `resolveSectionInk` vía `useSectionInk`;
`.is-ai-hidden` con la esquina gris y `EyeOff`). Cuatro modos (el `flipKey` de la fila):
- **`line` (nota cerrada):** bajo título+fecha, una línea de 4 px (9 px de margen arriba y 4 px abajo) con un segmento por sección (color de
  la sección al 42 %, ancho ∝ `section.content.length`; `sectionLineWeights`: proporcional, suelo del 3 %
  sin pasar del reparto igual; todo vacío → partes iguales), 2 px entre segmentos y 4 px de mínimo.
  **Sin IPC ni disco**: el contenido ya está en memoria. Con muchas secciones la junta y el mínimo
  encogen con `min()`/`calc()` sobre `--nsm-n` (nº de secciones) para que la línea nunca desborde.
  Hover en la fila → 7 px y color al 90 %; la caja mide 4 px y la línea crece centrada (spine
  `absolute`), así que el hover no mueve la lista. Las ocultas a la IA, más tenues (20 % / 45 %).
  Accesible como `role="img"` con `aria-label` "Sections: a, b, c" (`sidebar.sectionsSummary`).
- **Despliegue (peek):** el puntero quieto **140 ms** sobre la línea (zona de detección ±7 px con un
  `::before`; `pointerenter` arma el temporizador y `pointerleave` de la línea lo cancela, así que barrer
  la lista no lo abre) hace flotar el mismo mapa con nombres. Va en **portal a `document.body`, `fixed`**
  (`z-index` 45, bajo los menús contextuales; con `data-sidebar-portal` para el watchdog del sidebar
  flotante), no `absolute` en la fila: los cuerpos de grupo/carpeta llevan `overflow:hidden` (animación
  de colapso) y recortarían el de la última nota. Se alinea con la línea (sus celdas = ancho de la
  línea), sube si no cabe abajo, entra con fade 160 ms y las celdas salen de sus segmentos (FLIP 380 ms;
  etiquetas con `nsm-label-in` 150 ms después). Mientras está abierto, la línea se oculta
  (`.is-peeking`) y la fila conserva su fondo de hover (`[data-peeking]` en el `li`, mismo color que su
  `hover:bg-surface-3`: con el puntero sobre el portal la fila ya no está en `:hover`); ambas marcas se
  ponen por DOM (sin re-render), se quitan en cuanto empieza el cierre y vuelven si se reabre durante
  el fade. Se cierra al salir de fila+peek (`pointerleave` nativo
  de ambos mirando `relatedTarget`: el portal no es descendiente DOM de la fila) con fade 130 ms; al
  instante con scroll, blur/resize de la ventana o `dragstart`; también con cualquier tecla que no sea
  un modificador (Ctrl/Cmd sigue sirviendo para abrir al lado). Nunca con botones pulsados ni en táctil.
  No es alcanzable con teclado (celdas del peek `tabIndex=-1`): con teclado se abre la nota y su mapa sí
  es navegable.
- **`open` (nota activa = `noteViewId ?? activeNoteId`, como el resaltado de la fila):** bloque
  reticulado `flex-wrap` (celdas 22 px, juntas 3 px, radio 6 fuera / 3 dentro; etiqueta capada a
  120 px con el truco del *sizer* del editor). La sección abierta va en sólido y crece
  (`flex-grow: 2.6`); al cambiarla, transición CSS como en el editor.
  La resuelve `Sidebar` para la fila activa (`resolveOpenSectionId`:
  sección del panel que muestra la nota → la recordada → la primera; si ningún panel la muestra —p. ej.
  su note overview abierta sin que la nota esté en ningún panel; si un panel la tiene, manda la sección
  de ese panel—, solo la recordada o ninguna) desde dos selectores primitivos del store, y solo esa
  fila recibe `openSectionId` (las demás `null`): teclear no re-renderiza filas. Celdas focusables
  (`role="button"`, Enter/Espacio; Espacio con `preventDefault` para no hacer scroll).
  **Tope de 2 filas** (`OpenSectionMap`, subcomponente que **solo se monta en la fila activa y sin
  coincidencias de búsqueda**; también en el mapa compacto del peek de grupo): mismo algoritmo que el tope de 3 filas del
  editor (`planSectionMap` con `maxRows: 2` y sin `addWidth` + `visibleSectionIndices` de
  `src/lib/sectionMap.ts`), medido sobre una capa oculta `.nsm-measure` con todas las celdas a su ancho
  natural (`SectionCell measure`: copia inerte **sin `data-flip`**, foco, preview ni handlers, para que el
  FLIP no la vea) y la píldora `+N` con N = total; `useLayoutEffect` (firma id+nombre+`aiHidden`, sección
  abierta, idioma) + `ResizeObserver` (ancho del mapa y la capa). Lo que no cabe se pliega en la celda
  **`+N`** (`.nsm-cell.nsm-pill`: neutra, a su ancho natural, sin esquina; `sidebar.moreSections`
  `'+{count}'`, corto por el ancho del sidebar, con tooltip/aria-label plural `sidebar.showAllSections`);
  la abierta queda siempre visible (fijada). Pulsarla despliega todas y aparece una celda con `ChevronUp`
  (`sidebar.showLessSections`) para replegar. Las píldoras son `span role="button"` (están dentro del
  `<button>` de la fila): clic y Enter/Espacio con `stopPropagation`, no abren ni cambian la nota; con
  teclado el foco pasa a la píldora que aparece. `expanded` es estado local: al dejar de estar activa la
  nota (o al empezar a coincidir con una búsqueda) el subcomponente se desmonta y vuelve plegado. Desplegar/plegar anima
  las celdas que siguen (FLIP 300 ms sobre el mapa), las que aparecen entran con fade y las filas de
  debajo se deslizan (`captureRowTops`/`playRowShift` de `NoteSectionFlip.tsx`, los mismos de
  `RowShiftFlip`, sobre la lista con scroll más cercana: sidebar o peek de grupo); nada con
  reduced-motion. **Sin tope** cuando la búsqueda o el `#filtro` coinciden con alguna de sus secciones
  (`match`: una sección que coincide no puede quedar tras `+N`; se pinta el mapa completo, sin medir ni
  píldoras), ni en `search` ni en el despliegue flotante, que es un vistazo completo.
- **`search` (búsqueda o `#filtro` activos):** las notas cuyas secciones coinciden muestran el mapa **en
  línea** (no flotante), sin apuntar a la línea: `#filtro` muestra **solo** las secciones cuyo nombre
  coincide (como en la fila con scroll); con texto, todas, con las coincidentes (nombre o cuerpo) teñidas de
  su color al 20 % y el resto atenuadas (45 %). El término (filtro o texto) se resalta con
  `renderHighlightedText`. Si la nota solo coincide por título/tags, conserva su línea. La nota activa
  muestra siempre todas sus secciones (con el marcado de coincidencias encima).
- **Sin secciones** (p. ej. nota cifrada y bloqueada: `sections: []`) → no se pinta nada (igual en
  `SectionTabsRow`). Desbloqueada, sus secciones están en memoria y se ve como cualquier otra.
- **Clics:** fila → `handlers.click` (editor en la **primera sección**, vía el mismo `openAtSection` que
  `sectionClick`; sin secciones → solo `setActiveNote`); celda (mapa abierto,
  búsqueda o peek) → `handlers.sectionClick` (Ctrl/Cmd → panel al lado; resto igual que antes); clic
  derecho en celda → menú de sección. Preview de sección al hover en todas las celdas salvo la abierta
  (ya está en el editor). Los **segmentos no llevan preview**: el peek (140 ms) se adelanta al preview
  (~380 ms) y los tapa, así que el preview vive en las celdas del peek. Arrastrar/reordenar la nota no
  cambia (la fila sigue siendo el `<button draggable>`; el peek está fuera de él).
- **FLIP entre filas (`Sidebar/NoteSectionFlip.tsx` + `src/lib/flip.ts`):** al cambiar de nota activa,
  la fila nueva se despliega y la anterior se pliega **en el mismo commit**. `FlipScope` (componente de
  clase) usa `getSnapshotBeforeUpdate` —corre tras el render y **antes de tocar el DOM**, para todo el
  árbol a la vez— para medir los `[data-flip]` (clave = id de sección, en segmentos y celdas) relativos a
  la caja `.nsm` (`display: flow-root`, así su origen no cambia entre modos), y tras el commit los anima
  de la caja vieja a la nueva (translate+scale, 460 ms, `cubic-bezier(.22,.9,.24,1)`). La animación
  **no** se lanza en el propio `componentDidUpdate` sino en un `queueMicrotask` (`afterSyncRenders`;
  igual en `RowShiftFlip`): el tope de 2 filas del mapa abierto calcula su primer plan en un
  `useLayoutEffect` y pliega en un **segundo commit síncrono** (React lo vacía al final del primero,
  antes de pintar); medir el "Last" antes vería el mapa sin plegar y las celdas aterrizarían mal. Las
  secciones plegadas no tienen celda: no se animan (aparecen/desaparecen), el resto sí. Si el
  peek estaba abierto mide **sus** celdas: clic en una celda del peek → el mapa flotante "se convierte"
  en el de la nota sin cortes (el peek se desmonta en ese mismo commit; uno en fade-out se ignora).
  Desde la línea, las etiquetas entran 200 ms después. **Solo** anima transiciones desde/hacia `open`:
  una búsqueda cambia muchas filas a la vez entre `line` y `search` y medirlas por tecla no compensa
  (cambio instantáneo). `RowShiftFlip` (`PureComponent` montado una vez en `Sidebar`), cuando cambia la
  nota activa, recorre en el mismo snapshot **todas** las filas `[data-note-row]` leyendo su
  `getBoundingClientRect` (barato: el layout está limpio antes de mutar; no se corta al pasar el borde
  inferior porque las filas de un grupo colapsado siguen maquetadas dentro de su caja de alto 0 y no
  respetan el orden visual), se queda con las de alto > 0 que caen en el rect del sidebar (máx. 200) y
  desliza con `translateY` las que se movieron. Sin cambio de nota activa ambos salen en la comparación de props:
  coste cero al teclear. `prefers-reduced-motion`: sin FLIP, fades ni transiciones.
- **Rendimiento:** `NoteRow` sigue memoizada con `handlers` estables; el estado del peek es **local** de
  `NoteSectionMap` (un `setState` al abrir y otro al cerrar, nunca por `pointermove`) y el temporizador
  y las animaciones van por refs / Web Animations, así que el hover no re-renderiza la lista. La medida
  del tope de filas (capa oculta, `ResizeObserver`, `useLayoutEffect`) vive en `OpenSectionMap`, que
  solo existe en la fila activa: las cerradas nunca miden.
- **Ajuste "Sections in the sidebar"** (Ajustes → Apariencia; `themeStore.sidebarSectionsStyle`:
  `'map'` por defecto | `'row'`; **local**, en `localStorage` `noteflow-sidebar-sections`, como la
  escala de UI): `'row'` pinta las secciones con `SectionTabsRow` (ver abajo), siempre visibles, sin
  línea ni despliegue. `Sidebar` lee el ajuste una vez y lo pasa a `NoteRow` como prop primitiva
  (cambiarlo re-renderiza las filas una vez; nada más). El peek de grupo colapsado lo sigue igual (ver
  `GroupPeek` abajo); la vista de contenido no depende del ajuste (siempre el mapa completo).
- **`SectionTabsRow` (fila con scroll de celdas):** una sola línea sin salto con scroll horizontal
  (scrollbar nativa oculta con `.section-tabs-scroll`, máscara en los bordes, flechas al desbordar) de
  celdas `SectionCell` a su ancho natural (`.nsm-scroll`, `flex: 0 0 auto`, etiqueta capada a 160 px; la
  abierta en sólido con `useSectionInk`). Es su **único diseño** (los antiguos chips de color y su
  atenuación `dimmed` se eliminaron) y lo usan dos sitios con el ajuste `'row'`: la fila del sidebar y la del
  **peek de grupo colapsado** (la variante `'card'` de las tarjetas de las antiguas vistas de grupo /
  all-content se eliminó con ellas). La prop `placement` (`'sidebar'` | `'peek'`) fija el sangrado lateral
  para que la fila llegue de borde a borde (`-mx-2.5`/`px-2.5` en la fila, `-mx-2`/`px-2` en el peek) y
  `'peek'` añade `.nsm-compact`: celdas de 19 px, letra 10 px, esquina 5 px (7 px al
  hover), `EyeOff` 8 px y etiqueta capada a 130 px.
  La celda abierta (`activeSectionId`) se mantiene a la vista: al montar (al instante) y al cambiar la
  sección abierta (suave, salvo reduced-motion) se ajusta solo el `scrollLeft` de la fila (no
  `scrollIntoView`, que movería también la lista en vertical), con 22 px de margen para librar el borde
  difuminado y las flechas. El `#filtro` (`sectionFilter`) filtra las celdas y se resalta el término
  (el filtro o, si no hay, el texto de `searchQuery`). Preview de sección al hover, clic y clic derecho
  los da `SectionCell` (el peek suprime el menú contextual).
- **Sección abierta marcada:** la fila del sidebar y el peek resuelven la de la nota resaltada con
  `resolveOpenSectionId` sobre los dos selectores primitivos de `Sidebar/useOpenNoteSection.ts`
  (compartidos; el peek solo se suscribe mientras está abierto) y solo la fila activa recibe el id. La
  vista de contenido marca su propia selección (la sección de la vista previa), no la del editor.
- **`GroupPeek`** (peek de grupo colapsado) sigue el mismo ajuste que el sidebar (selector primitivo en
  `GroupPeekPanel`, que solo existe mientras está abierto), siempre en compacto (`.nsm-compact`):
  - `'row'`: `SectionTabsRow placement="peek"`.
  - `'map'` (por defecto): `NoteSectionMap inGroupPeek`, con los mismos modos que en el sidebar (línea
    en las cerradas con su despliegue a los 140 ms, mapa abierto en la activa, `search` con la query del
    peek; el mapa abierto, también con el tope de 2 filas y `+N`). En compacto la línea lleva 7/3 px de
    margen, el mapa abierto 5 px arriba y sus celdas 19 px con etiqueta capada a 100 px (las de 22 px pesaban demasiado bajo títulos de 11.5 px). El `<li>` de
    `PeekRow` lleva `data-note-row` (lo que `NoteSectionMap` toma como su fila: hover que engorda la
    línea, salida del despliegue y `[data-peeking]`, con su regla para `button[data-peek-index]`; no
    lleva `data-note-id`, que `Sidebar` busca en el documento). Celdas → `onOpenSection` del peek
    (modificadores incluidos, cierra el peek) vía un `mapHandlers` memoizado; sin menú contextual.
  - **Despliegue sobre el peek:** el mapa flotante va en portal a `document.body` con
    `.is-over-group-peek` (`z-index` 51, sobre el `z-50` del peek) y `data-group-peek-portal`
    (`GROUP_PEEK_PORTAL_ATTR` en `sidebarAnchor.ts`): el `pointerdown` global del peek no lo trata como
    "fuera", así que el clic en una celda llega. Pasar del peek al despliegue no lo cierra: el portal es
    hijo React del panel y los `onMouseEnter/Leave` de React siguen el árbol React (salir del despliegue
    hacia fuera sí cuenta como salir del peek); con `data-sidebar-portal`, el watchdog del sidebar
    flotante también lo cuenta como dentro. El despliegue se cierra con cualquier scroll (también el de
    la lista del peek), con tecla y al salir de fila+despliegue; al cerrarse el peek se desmonta con él.
    Sin FLIP al abrir el peek (`FlipScope` solo anima cambios de modo hacia/desde `open`, nunca al montar;
    `RowShiftFlip` solo mide filas dentro del sidebar).
  - Alto de la lista por modo (`LIST_MAX_HEIGHT`, ≈ cinco notas): `map` 200 px (≈39 px por nota cerrada;
    la activa ≈49), `row` 240 px (≈48 px por nota). `ESTIMATED_HEIGHT`: 260 / 300.
  - Sin atenuación de las notas no activas (los chips usaban `dimmed`): las celdas ya son neutras (fondo
    `--text/0.065`, texto apagado), como en el sidebar, donde tampoco se atenúan; `.is-dim` queda
    reservado al "no coincide" de la búsqueda.

### Sidebar: grupos y carpetas (Índice con guías)
Cabeceras y cuerpos de grupo/carpeta en `Sidebar.tsx` (`renderFolder` y el bloque de grupos),
`NoteGroupHeader.tsx`, `NoteFolderHeader.tsx` (+ `FolderGlyph`) y `GroupGuides.tsx`;
estilos en el bloque `.sbg-*` al final de `index.css`; números y helpers puros en
`src/lib/sidebarGuides.ts` (tests en `tests/lib/sidebarGuides.test.ts`).
- **Color:** `--g` = `colorChannels(group.color)` en el `li` del grupo (`style`); todo el CSS usa
  `rgb(var(--g) / a)`, así vale para variables del tema y para color libre. Solo variables del tema
  (`--text`, `--text-muted`, `--bg-1` = fondo del sidebar, también flotante): claro y oscuro igual.
- **Geometría** (x desde el `li`; el `ul` ya tiene `px-2.5`): pestaña 4–17 (13×10, esquina plegada
  6 px → 9 px plegado) · guía de grupo x=10 (1,5 px, 38 %) · notas sueltas con el título en x=25 (=
  nombre del grupo: `wrapperClassName='pl-[17px]'` + `indent=8` de `renderNoteButton`) · carpeta: icono
  23–37, guía x=30 (26 %), notas en x=43 (`pl-[35px]` + 8). La guía del grupo nace 4 px bajo la pestaña
  (conector `.sbg-gh::before`) y sigue en `.sbg-in::before` por todo el cuerpo, carpetas incluidas.
- **Sticky:** cabecera de grupo `top: 0` (34 px, `.sbg-gh` = el wrapper arrastrable para reordenar
  grupos, hijo directo del `li`, así se pega mientras dure el grupo) y de carpeta `top: 34px`. El sticky
  se corta en un ancestro con `overflow: hidden`, así que el interior del cuerpo (`.sbg-clip`) es
  `overflow: visible` expandido y en reposo, y `hidden` solo plegado o mientras pliega/despliega
  (`[data-anim]`, puesto por `GroupGuides` al ver cambiar `collapsedGroupIds`/`collapsedFolderIds` —
  identidad de los Sets del store— y quitado a los 360+80 ms). Las filas llevan `scroll-margin-top`
  para que la navegación de la búsqueda (`scrollIntoView`) no las deje bajo las cabeceras.
- **Nota activa:** fondo neutro `--text/0.07` (sin tinte del grupo; también favoritas, sin grupo y
  peek). El color lo pone el **cursor**: un `<i class="sbg-cur">` por grupo en `.sbg-in`, que
  `GroupGuides` coloca imperativamente junto a la fila (`top = offsetTop + 7`, alto − 14; x 8,5 en la
  guía del grupo o 28,5 en la de su carpeta). Mide con la **cadena `offsetTop`** (las filas pueden estar
  en FLIP con `transform`). Se desliza (CSS 450 ms) solo cuando cambia la nota abierta; cualquier otro
  recolocado (resize de un cuerpo: carpetas plegando, el mapa de la fila activa que cambia de alto,
  ancho del sidebar; o mutaciones de la lista) es instantáneo, salvo dentro de la ventana de 450 ms
  de un deslizamiento en curso. Oculto si la nota no está en el grupo o su carpeta está plegada; al
  reaparecer salta y hace fade-in. Grupo plegado con la nota abierta (`has-open`): pestaña al 40 % y el
  título de la nota junto al nombre (`.sbg-gact`); carpeta plegada: trazo del icono en el color.
- **Icono personalizado de carpeta** (menú contextual de la carpeta → "Change icon", fila que despliega
  in situ una rejilla de 6 columnas: "Default" + 27 iconos a 16px; elegir aplica y cierra). `NoteFolder.icon` guarda una
  **clave estable** del set curado `FOLDER_ICONS` (`src/lib/folderIcons.ts`; claves = objeto dibujado,
  no el nombre del export de lucide, que cambia entre versiones), nunca un componente. Sin clave o con
  una desconocida (cliente más nuevo) → `FolderGlyph`. Solo se **añaden** claves al final (renombrar o
  quitar una devuelve al predeterminado las carpetas que la usan) + su etiqueta en `common.folderIcons`
  (EN/ES; un test exige etiqueta por clave). `groupsStore.setFolderIcon(id, null)` borra el campo (no
  escribe `icon: null`). Render: `FolderIcon` (donde va el glyph: cabecera y rename del sidebar,
  columna de lugares, ruta de la fila y miga de la vista previa en la vista de contenido; lucide 13 px
  con `.sbg-folder-ico` = mismo gris y mismo acento `has-open` que el glyph, sin solapa animada) y
  `FolderListIcon` (listas con lucide `Folder` de fallback: submenú "Move to folder", barra de
  selección, etiqueta de carpeta del peek). Los inputs de **nueva** carpeta siguen con el glyph.
- **Sin foco al pasar por la cabecera:** el prototipo atenuaba el resto de la lista al dejar el ratón
  sobre la cabecera de un grupo expandido; se quitó a petición del usuario (no le gustaba). La
  atenuación solo existe durante el arrastre de una nota (abajo). El hover de la cabecera solo
  muestra el chevron y alimenta el peek de grupo plegado.
- **Plegar/desplegar** (360 ms, `cubic-bezier(.22,.9,.24,1)`): la guía se recoge (240 ms ease-in) y las
  filas se desvanecen (−3 px); al desplegar la guía se dibuja (480 ms) y las filas entran escalonadas
  30 ms (`--i`: `NoteRow` recibe `staggerIndex` primitivo capado a 10 y monta el estilo dentro; las
  cabeceras de carpeta cuentan tras las sueltas). Las notas de carpeta llevan su índice **en la
  carpeta**; el `.sbg-f` lleva `--fi` (el paso de su cabecera) y el CSS las retrasa a
  `min(--fi + 1 + --i, 10)` al desplegar el grupo (entran tras su cabecera) y a `--i` al desplegar
  solo la carpeta (`.sbg-f[data-anim]`). Así reordenar notas fuera de la carpeta no re-renderiza sus
  filas. El hueco "Drop in…" alinea su texto con los títulos (x 25 / 43, compensando borde y padding).
- **StrictMode (dev):** `GroupGuides` sobrevive al mount→unmount→mount de la misma instancia
  (reinicia `unmounted` y deja los observers a `null` al desmontar); test en
  `tests/components/groupGuides.test.ts` (happy-dom).
- **Arrastre de nota a otro grupo/carpeta:** el destino (`noteMoveTarget`, ahora con el id de la nota
  arrastrada) lleva `is-drop-group` en el `li` (guía 75 %, foco: `.sbg-list.is-drop-spot` atenúa el
  resto) e `is-drop` en el grupo o la carpeta concretos (subrayado `::after` bajo su cabecera, 340 ms
  desde la izquierda). Al final de la lista destino, hueco `.sbg-slot` "Drop in {name}"
  (`sidebar.dropIn`) si la nota no está ya ahí (`dropChangesPlace`; arrastrar desde favoritas a su propio
  grupo no lo muestra). Un destino plegado se abre a los 650 ms con `toggleGroupCollapsed`/
  `toggleFolderCollapsed` (persistido, como un clic). Sustituye al recuadro con tinte anterior. Ojo: el
  id del arrastre se copia como primitivo (`String(ref.current)`) antes de ir al estado; el valor crudo
  de un ref en un `setState` hace que el React Compiler abandone el componente (lint
  `preserve-manual-memoization` sobre `rowHandlers`).
- **Peek de grupo plegado:** misma pestaña (esquina 9 px) y nombre 12,5/650 en caja normal en la
  cabecera; la barra de 2 px del borde pasa a ser la guía del grupo a la izquierda de la lista
  (`.sbg-peek-list::before`, fuera del scroller para que no se desplace con él).
- **Favoritas:** estrella en la cabecera y, en cada favorita con grupo, su pestaña pequeña (11×9) antes
  del título (`title` = nombre del grupo).
- **Accesibilidad:** cabeceras `role="button"`, `tabIndex=0`, `aria-expanded`; Enter/Espacio pliegan;
  el chevron (oculto en reposo) aparece con hover o `:focus-visible`. `prefers-reduced-motion`: sin
  transiciones ni escalonado (bloque propio al final del `.sbg-*`).

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
  de links; `inlineElToMd` lo revierte. Por eso los previews (que usan `htmlFromMarkdown`)
  pinta la pill en los previews sin código extra (estilo por atributo en `index.css`).
- **Editor (`src/components/Editor/`):** `SectionRelation.ts` (nodo inline atom + comando
  `insertSectionRelation`, NodeView React `SectionRelationView.tsx`: nombre en vivo desde el store,
  estado "roto" si el destino no existe, hover vía `previewProps`, click vía
  `notesStore.navigateToSection`). El slash usa **`@tiptap/suggestion`** (dep nueva, JS puro):
  `SlashCommands.ts` (Suggestion `char:'/'`, off en code blocks) + `SlashCommandMenu.tsx` (popup
  comandos) + `SectionLinkPicker.tsx` (overlay buscador). `Editor.tsx` registra ambas extensiones y
  abre el picker con estado local. Solo en modo markdown; en modo texto se ve el markdown literal.
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
`src/components/Settings/`). El orden canónico de la nav es el array `NAV` de `SettingsModal.tsx`:
**grupos** (`preferences`/`services`/`notes`/`help`, título en `settings.navGroups`) con sus
entradas (icono + id; las labels salen del diccionario i18n por id) — no se duplica aquí. La **sección por
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
Ajustes → Suscripción (los paneles que ya viven dentro de Ajustes usan su prop `onNavigate`).

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

### Tour "What's new" / tutorial (`src/components/WhatsNew/`)
Popup grande de diapositivas (clip en bucle de la propia app dentro de un "marco de ventana" +
título + texto + chips de atajos) que sale **solo en la ventana principal** tras arrancar si hay
diapositivas que este dispositivo no ha visto. Piezas:
- **Datos:** `whatsNewSlides.ts` — array `WHATS_NEW_SLIDES` (**su orden = orden de presentación**):
  `id`, `since` (versión que la añadió), icono lucide, `accent` (una CSS var del tema:
  `accent|accent-2|accent-3|cyan|purple|red` → se ve bien en los 14 temas), `i18nKey`, `keys`
  (`{id, combo}`; `combo` son tokens crudos que `keyLabel` resuelve por plataforma → ⌘/⌃ en macOS)
  y, solo en `more`, `extras` (la rejilla de chips). El texto vive en el namespace i18n
  `whatsNew` (`slides.<id>.{title,body}`): los `{placeholders}` del cuerpo son los `keys[].id` de
  esa diapositiva y se pintan como `<kbd>` inline (test en `tests/lib/whatsNew.test.ts` que lo
  comprueba en EN y ES) — **nunca** escribir "Ctrl+…" literal en el copy.
- **Lógica pura:** `src/lib/whatsNew.ts` (saneo/unión de ids vistos, qué presentar, navegación,
  resolución del media) + `tests/lib/whatsNew.test.ts`. Main tiene su copia del saneo en
  `electron/whatsNewSeen.ts` (rootDir separa `electron/` de `src/`; el test compara ambas).
- **Persistencia:** `settings.json` → **`whatsNewSeen: string[]`** (local por dispositivo, no se
  sincroniza: cada máquina ve su tour). IPC `whats-new:get-seen` → `{seen, disabled}` y
  `whats-new:mark-seen(ids)` (unión saneada; solo escribe si cambia). Estado en
  `src/stores/whatsNewStore.ts` (`seen`, `tour`, `openStartupTour`, `openFullTour(startId?)`,
  `markSeen` optimista).
- **Qué se presenta** (`planStartupTour`): nada visto → **todas** en modo `discover` (cabecera
  "Discover NoteFlow"); algo visto → **solo las no vistas** en modo `new` ("New in NoteFlow
  v{version}", versión de `app:get-version`). Ids guardados de diapositivas que ya no existen
  cuentan como "ha visto algo". Sin pendientes → no sale.
- **Marcado como visto:** cada diapositiva se marca **en cuanto se muestra** (un cierre/crash a
  mitad conserva el progreso) y al cerrar/saltar un tour de arranque se marca **todo el lote**
  (no vuelve a salir). Abierto a mano (modo `replay`: Ajustes → Tutorial o la paleta, "What's new
  / Tutorial") solo marca lo que se ha visto de verdad.
- **Disparo** (`WhatsNewHost.tsx`, montado en `MainApp` fuera de la rama sticky → nunca en
  sticky/ventana de sección/chat): tras el **primer `loadNotes()`** (transición `isLoading`
  true→false vía `subscribe`; el efecto del hijo corre antes del `loadNotes` del padre, así que no
  se la pierde) + **700 ms**; si la ventana arrancó **oculta** (autostart al tray) espera a
  `visibilitychange`; si hay **otro modal** abierto (cualquier overlay `fixed inset-0` con
  `bg-black/…`, o la paleta) reintenta cada 1 s y se rinde en ese arranque a los 2 min. Un modal
  nuevo de la app debe seguir ese patrón de backdrop para que el tour lo respete.
- **Kill switch:** env **`NOTEFLOW_DISABLE_WHATS_NEW=1`** (leído en main y devuelto como
  `disabled`) apaga solo el popup de arranque; lo usa `scripts/update-e2e.cjs`, cuyo perfil limpio
  si no taparía el botón de update del titlebar.
- **Capa y teclado:** `.wn-root` es `z-70` (encima de Ajustes, `z-50`, porque se abre desde ahí y
  Ajustes sigue abierto debajo). Mientras está abierto, **ninguna tecla llega a lo de detrás**:
  listener `keydown` en **captura de `window`** que hace `stopImmediatePropagation()` de **todas**
  las teclas (←/→/Enter/Esc/Tab las gestiona; el resto solo se corta). Sin eso, p. ej. `Delete`
  con el foco en un botón del tour llegaba al listener del editor (`NoteEditor`, borrar nota) y abría
  su confirmación detrás del tour. Cortar la propagación no anula las acciones por defecto, así que
  Enter/Espacio sobre un botón enfocado siguen pulsándolo. Los listeners de captura de `window`
  registrados **antes** (aceleradores de `App.tsx`, Ctrl+Tab de `NoteEditor`) corren igualmente
  primero: se apartan porque el root lleva **`data-own-keys`**, así que el foco **tiene que
  quedarse dentro del diálogo**. Ojo: Chromium manda el foco a `<body>` **sin** `focusin` cuando el
  elemento enfocado se vuelve `disabled` o se desmonta — y en `<body>` esos aceleradores sí actúan
  (p. ej. Ctrl+W abría el "borrar sección" detrás). Por eso: el diálogo tiene `tabIndex={-1}` (un
  click en una zona no interactiva lo enfoca); **Atrás** usa `aria-disabled` (+ guarda en
  `onClick`, `tabIndex -1` y oculto) en la primera diapositiva, nunca `disabled`; antes de cambiar
  de diapositiva, si el foco está en un control que va a desaparecer (Skip al llegar a la última,
  Atrás al llegar a la primera) pasa al botón principal; un `useLayoutEffect` tras cada cambio de
  diapositiva reenfoca el botón principal si el foco no está en un control vivo del diálogo; Tab
  hace de trap (salta los `aria-disabled`); un `focusin` fuera del diálogo devuelve el foco; y el
  backdrop hace `preventDefault` en `mousedown` para que el foco no salga durante el fade de
  cierre. Si aun así una tecla llega con el foco fuera, se anula y se reenfoca (aunque los
  aceleradores de `App.tsx` ya habrán corrido: el arreglo real es que el foco no salga). Cada apertura lleva un `seq` (key del modal y guarda de `closeTour(seq)`): el timer
  del fade de cierre se limpia al desmontar y nunca cierra un tour abierto después.
- **Media:** `src/assets/whats-new/<id>[.<lang>].webm` (VP9, en bucle, sin audio) y póster
  opcional `<id>[.<lang>].png`. Resolución por tipo: **`<id>.<lang>`** (idioma efectivo de la UI,
  `en`/`es`) → **`<id>`** neutro → **fallback animado** (icono grande con anillos, órbitas y
  partículas en el color de la diapositiva, todo CSS). Se cargan con un `import.meta.glob` eager
  `?url` (`whatsNewMedia.ts`): un fichero (o la carpeta entera) que falte **no rompe el build**,
  simplemente no está en el mapa; un `<video>` que falla al cargar también cae al fallback. Vite
  emite cada clip a `dist/assets/` y lo referencia con `new URL(…, import.meta.url)` (vale bajo
  `file://`); la CSP de `index.html` tiene `media-src 'self' data:` (los <4 KB se inlinean como
  `data:`). En `more`, sin clip se pinta la rejilla de chips dentro del marco; con clip, la rejilla
  pasa en lista a la columna de texto. Los clips los graba `scripts/whats-new-capture.cjs` desde la
  app real (detalle en `release.md` § "Clips del tour What's new"). El de **`agents`** es el único
  que no abre en NoteFlow: un terminal falso con un agente de IA genérico (una página HTML en una
  ventana extra del Electron lanzado, sin nombre ni estética de ningún producto real) recibe una
  petición en lenguaje natural, "ejecuta" `noteflow sections` / `noteflow add` (salida copiada de los
  `out()` reales de `cmdSections`/`cmdAdd`) y luego entra la app, donde la tarea aparece en vivo. El
  `noteflow add` es **simulado**: el script escribe en el dir de notas temporal exactamente los
  ficheros que escribiría el CLI (append a la sección + `note.md` reescrito con el `serializeNoteMd`
  del propio CLI, importado como módulo) y la app lo recoge con su `fs.watch` del dir de notas. El
  CLI real **nunca** se ejecuta durante la captura (`NOTEFLOW_NOTES_DIR` no aísla su sesión de Cloud).
- **Animación** (`index.css` § "What's new" tour, clases `.wn-*`): entrada del modal con easing
  spring + blur; fondo "aurora" (blobs difuminados con `--wn-c` = color de la diapositiva y el
  acento del tema; el cambio de color entre diapositivas se anima porque los elementos transicionan
  su `color`/`background-color`/`box-shadow` computados); transición direccional (`--dx`) con parallax
  media/texto y reveal escalonado (título → cuerpo → chips, que hacen un "press" uno tras otro);
  luz que recorre el borde del marco (un cuadrado con el `conic-gradient` que rota dentro del anillo
  enmascarado). `prefers-reduced-motion`: todo se
  queda en fades de opacidad y los bucles se paran; el clip **no** se reproduce (ni autoplay ni
  loop): se muestra el póster como imagen fija o, sin póster, el fallback estático (`SlideClip`,
  `matchMedia` leído al montar, como `ActivityPulse`/`PlanCardBackdrop`). Lo mismo en las
  miniaturas de Ajustes → Tutorial (no se reproducen al hover). Layout compacto (una columna) por debajo de
  760 px de ancho (ventana mínima 700×500 y zoom de UI). La diapositiva vive en **una celda de
  grid de altura definida** (`.wn-deck`/`.wn-slide` con `grid-template-rows: minmax(0, 1fr)`) y la
  columna de texto tiene `max-height: 100%` + `overflow-y: auto`: si no cabe (ventana pequeña, la
  lista de chips de `more` junto a su clip) **hace scroll en vez de montarse sobre el footer**. En
  una columna el media conserva ≥ 110 px y el texto se lleva el resto.
- **Ajustes → Tutorial** (`Settings/TutorialPanel.tsx`): "Play full tour" + una tarjeta por
  diapositiva (miniatura = el clip, que se reproduce al hover o con foco de teclado; fallback =
  icono; badge "New" si no está vista; versión `since`). El póster de la miniatura es un `<img>`
  **encima** del `<video>` (`ThumbClip` en `SlideVisual.tsx`), no el atributo `poster`: Chromium
  solo pinta `poster` hasta que el vídeo se reproduce por primera vez, y tras un hover (pausa +
  rebobinado) la tarjeta se quedaba en el fotograma 0 del clip, que es **negro** (los clips entran
  con fundido desde negro). El `<img>` se oculta solo cuando el vídeo ya está reproduciendo y
  vuelve al instante al parar. Click → tour completo empezando en esa diapositiva. Con póster, el
  `<video>` de la miniatura **no se monta hasta el primer hover/foco** (el póster lo tapa igual): una
  tubería de vídeo por tarjeta, todas a la vez, pesaba al abrir el panel.
- **Rendimiento (equipos viejos / composición por software) — invariantes:** los bucles infinitos
  solo animan `transform` sobre capas que se pintan **una vez**; nada de filtros ni repintados por
  frame. Si se toca, mantenerlo:
  - **Aurora del tour sin `filter`:** cada `.wn-blob` es un `radial-gradient` que dibuja la elipse
    ya difuminada (caída gaussiana, un stop cada ½ sigma; `--wn-bs`/`--wn-bd` ajustados por blob
    contra el `blur(72px)` real). La caja mide el doble que la elipse (para el borde suave), así que
    posición, tamaño y los `translate` de `wn-drift-*` van a la mitad/al doble respecto a la elipse.
    El color es `color` (`currentColor` en los stops), que sí transiciona. Antes era
    `filter: blur(72px)` en el contenedor con los blobs moviéndose dentro → blur de ~1,1 MP **en cada
    frame** mientras el tour está abierto. Diferencia medida contra el original: ≤ 7 niveles de 255
    en el peor píxel, media < 0,6.
  - **Banner de Ajustes → Tutorial (`.wn-card-aurora`/`.wn-card-blob-*`):** ahí las elipses son
    mucho más planas que el radio del blur y un gradiente no lo reproduce, así que conserva el blur
    real, pero en un `::before` **estático** dentro del elemento que se mueve: Chromium puede
    componerlo sin recalcular el blur (no garantizado con composición por software, pero nunca peor
    que antes). No volver a poner el `filter` en el contenedor.
  - **Luz del marco:** el `conic-gradient` se pinta una vez en `.wn-frame-glow::before` (cuadrado
    del 125 % del ancho, > la diagonal de la caja 3:2) y rota con `transform`; antes se animaba el
    ángulo con `@property`, que repinta el gradiente en el hilo principal cada frame. Si cambia la
    proporción del marco, revisar ese 125 %.
  - **Keyframes de entrada (`wn-modal-in`, `wn-media-in`) acaban en `filter: none`**, no `blur(0)`:
    con `fill-mode: both` un filtro que se queda aplicado mantiene modal y media en una pasada
    offscreen permanente.
  - **Diapositiva saliente:** se remonta (su `key` cambia), así que su clip sería un `<video>` nuevo
    cargando desde el fotograma 0 durante 380 ms; pinta el **póster** (`SlideClip still`).
  - `.settings-content` (scroll de Ajustes) lleva `bg-surface-1` opaco, el mismo color de la
    ventana: en pantallas de DPI estándar Chromium solo compone el scroll de un contenedor con fondo
    opaco; sin él repinta el contenido en cada frame de scroll.
  - **Pendiente / no tocado por cambiar el aspecto:** los `backdrop-filter` a pantalla completa
    (`.wn-backdrop` 10 px, `backdrop-blur-sm` del overlay de Ajustes y del resto de modales) se
    recalculan en la zona dañada en cada frame que cambia algo encima; es probablemente el mayor
    coste que queda.

**Añadir diapositivas en un release:** (1) entrada nueva en `WHATS_NEW_SLIDES` **antes de `more`**
(que cierra el tour completo) con `since` = la versión del release; (2) su copy en
`src/i18n/en/whatsNew.ts` y `es/whatsNew.ts` (`slides.<id>`), con `{placeholders}` = sus `keys`;
(3) el clip `src/assets/whats-new/<id>.en.webm` / `<id>.es.webm` (o `<id>.webm` si no hay texto
de UI visible). Los usuarios que ya vieron el resto recibirán solo las nuevas en el siguiente
arranque. **Nunca** renombrar ni reutilizar un id (lo guarda `whatsNewSeen` y lo usa el script de
captura de clips); para retirar una diapositiva, quitarla del array (su id guardado es inocuo).

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

**Varios editores de la misma nota (paneles del split, ventanas de sección, stickies) — no pisarse.**
Cada editor guardaba antes `updateNote(id, { sections })` con la lista COMPLETA construida desde su
snapshot de render: con dos editores de la misma nota, el último en escribir reescribía la sección
del otro con su copia vieja. Invariantes actuales (`notesStore.ts`):
- **Cola por nota** (`lib/keyedQueue.ts`): toda escritura de una nota (`updateNote`, `mutateSections`,
  `updateSection`, `duplicateSection`, archivar, hacer permanente, reprogramar caducidad, cifrar) pasa por una cola serial
  con clave = id de nota, y lee la nota del store **al ejecutarse**, no al llamarse. Sin cola, dos
  escrituras cercanas partían del mismo snapshot (el `set` del store ocurre tras el `await` del disco).
- **Guardar solo lo propio:** los editores (`NoteEditor`, `StickyApp`) usan
  `updateSection(noteId, sectionId, patch)` (contenido, nombre, raw, aiHidden) y
  `mutateSections(noteId, fn)` para cambios estructurales (añadir, borrar, reordenar, deshacer borrado),
  que aplican el cambio sobre la lista MÁS RECIENTE. `updateSection` sobre una sección que ya no
  existe es no-op (nunca la resucita); el "deshacer" de un borrado re-inserta esa sección en su índice
  en vez de restaurar un snapshot de toda la lista. No volver a construir `sections` completas desde un
  snapshot de render para guardar.
- **Entre procesos** (ventana de sección/sticky ↔ principal) cada renderer tiene su store; lo que evita
  pisarse es el formato v2 (un fichero por sección: el diff de `buildNoteWritePayload` solo reescribe
  las secciones que cambian respecto al store) + lo anterior. Si un `syncNote` (escritura de OTRA
  ventana) reemplaza la nota mientras nuestra escritura está en vuelo, al terminar se detecta
  (`current !== note`) y se relee del disco (`syncNote`) para no ocultar en memoria el cambio ajeno.
  Simétrico en `syncNote`: si la nota del store cambió durante sus `await` (lectura del disco o
  re-descifrado) por una escritura local, NO la pisa con su copia vieja y relee **una** vez (la
  escritura local llega al disco antes que al store); si vuelve a cambiar, se salta.
  **Lo mismo en `loadNotes`** (recarga completa: pull, Cloud, otra ventana): guarda `get().notes` antes
  de leer y, al hacer `set`, toda nota cuyo objeto del store cambió durante la carga (IPC + PBKDF2 del
  re-descifrado) **conserva la copia en memoria** — o sigue borrada; una creada durante la carga
  también se conserva — y después se le hace `syncNote` para recoger una versión del disco más nueva
  (`keepNotesChangedDuringLoad` en `lib/reloadGuard.ts`, tests en `tests/lib/reloadGuard.test.ts`;
  una copia cambiada con la misma huella, `noteFingerprint`, toma la cargada sin re-sync). Invariante:
  **el store nunca retrocede** por una recarga: los editores ya consumieron esa escritura como eco
  propio, y volver a la versión vieja la aplicaría (o la fusionaría duplicando una línea). Aplica en
  todas las ramas de `set({ notes })` (también la de ventana de sección); la guarda de "0 notas" no
  toca `notes`. Una copia conservada de una nota cuya contraseña de sesión se acaba de quitar
  (`failed` del re-descifrado) se **re-bloquea** (`relockNotes`, `sections: []`): no queda texto plano
  en memoria sin contraseña.
- **Notas cifradas — invariante:** NO se editan entre ventanas. El desbloqueo es por proceso (la
  contraseña de sesión vive en `sessionPasswords` del store de cada ventana) y cada escritura
  re-cifra el blob ENTERO desde las secciones en memoria de quien escribe. Por eso: la ventana de
  sección no se ofrece para notas cifradas (menú de sección y paleta la ocultan) y, si aun así le
  llega una (hash viejo, o la nota se cifró con la ventana abierta), la muestra en **solo lectura**
  (descifrado local, sin contraseña en el store), igual que la sticky. Los paneles del split sí
  pueden editarla: comparten proceso, contraseña y cola.
- **Recarga con contraseña en sesión:** `loadNotes` y `syncNote` parsean del disco la nota cifrada
  con `sections: []`. Si hay contraseña de sesión se **re-descifra** con ella
  (`lib/encryptedSession.ts` → `redecryptWithSession`); si falla, se quita la contraseña (vuelve a
  bloqueada). Defensa adicional: `applyNoteUpdate`/`mutateSections` (y por tanto `updateSection`)
  **rechazan** escribir secciones de una nota cifrada sin secciones descifradas en memoria o que la
  dejaría sin secciones (`isUnsafeEncryptedSectionsWrite`, no-op + `console.warn`) — re-cifrar desde
  `[]` + la sección editada borraría el resto; y `NoteEditor` muestra la vista bloqueada si la nota
  cifrada tiene contraseña pero 0 secciones (nunca "desbloqueada pero vacía").
- **Título:** el borrador del título solo se protege de actualizaciones del store si está *sucio*
  (`titleDirtyRef`) y el blur solo escribe si está sucio — un input enfocado pero inactivo (p. ej. en
  otra ventana) sigue el título editado en otro panel y no lo revierte al perder el foco.
- **Contenido de la sección abierta:** los editores (rich, raw, sticky) aplican o fusionan el contenido
  externo también con el foco puesto — ver "Sync de contenido externo en los editores".
- **Riesgo residual asumido:** cambios estructurales simultáneos en dos procesos (p. ej. borrar una
  sección en una ventana mientras la otra escribe `note.md` con la lista vieja en el mismo instante)
  pueden dejar `note.md` con una sección cuyo fichero ya no existe; mismo riesgo que ya había con stickies.
- **Alarmas:** solo la ventana principal (y las stickies, por histórico) llaman a `scheduleAlarms`;
  la ventana de sección no. Para que un deadline creado en una ventana de sección se programe, el
  `syncNote` de la ventana principal re-registra el set completo cuando cambian las alarmas de esa nota.

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

**Píldora plegada y radio de la región:** el fold pide `FOLDED_W×FOLDED_H` (220×32), pero en
Windows una ventana frameless **opaca** no puede medir menos de **39px** de alto (el SO recorta
el `setSize`; solo `transparent: true` permite 32). Por eso `FoldedPill` (`StickyApp.tsx`) usa
`h-screen` y no una altura fija: rellena la ventana mida lo que mida, y no asoma el fondo
`#1e1e1e` por debajo. La región de `setShape()` usa siempre radio **8px** (`STICKY_RADIUS`,
igual que el `rounded-lg` del CSS, también en plegado — no hay radio "media altura" de píldora)
y se calcula con el **tamaño real** (`win.getSize()`) en cada tick de `animateStickyWindow`,
no con el solicitado, para que el recorte DWM y el borde CSS coincidan.

**Cambiar de sección en el sitio (`SectionSwitcher` en `StickyApp.tsx`):** con 2+ secciones el nombre
de la sección de la barra de título es un botón (`no-drag`) que abre un menú con todas las secciones
(orden `note.sections`; en una nota cifrada desbloqueada, las `unlockedSections`, que siguen en solo
lectura; las `aiHidden` se listan igual). Regla de visibilidad pura en `lib/stickySectionMenu.ts`
(`showStickySectionName`, tests en `tests/lib/stickySectionMenu.test.ts`): el nombre `New`/`Main` solo
se oculta si la nota tiene una única sección (también en la píldora plegada, que no es interactiva).
Elegir otra sección: `flushPendingEdits(noteId)` **antes** de `setSectionId` (el raw guarda en la
sección capturada al programar —y usa `noteId/sectionId` como target del debounce—; el `Editor` rich
va keyed por sección), el buffer raw arranca con el texto nuevo (el textarea va keyed por sección:
scroll arriba y sin undo nativo hacia la otra sección) y el hash se reescribe con
`history.replaceState` (`stickyHashWithSection`) para que una recarga reabra la sección mostrada. El
main no sabe qué sección muestra cada sticky (sin IPC); el hash solo cubre la recarga de esa
ventana: al reiniciar la app, las stickies de arranque se abren con su sección configurada. Cierre:
Escape/Tab (devuelven el foco al trigger), clic fuera (backdrop transparente `no-drag`, que además
anula la región de arrastre de la barra mientras está abierto: sin él, los clics en la barra no llegan
al renderer; no mueve el foco), blur de la ventana o al elegir. Teclado: listener de `window` mientras
está abierto (flechas con wrap, Home/End vía `menuNavIndex`); Enter/Espacio son la activación nativa
del botón del ítem. **Foco tras elegir otra sección** (ratón o teclado): al contenido de la nueva —
el `Editor` rich se autoenfoca al montar; el textarea raw/solo lectura lo enfoca un efecto sobre
`section.id` (flag `focusContentRef`, caret al inicio). Elegir la sección actual no cambia nada y
cierra como Escape (con teclado, foco al trigger: `click` con `detail` 0 = teclado). Al re-keyear el
buffer raw se resetea también `rawComposingRef` (un textarea desmontado a mitad de una composición IME
no dispara `compositionend`).

### Vista dividida por paneles (`lib/paneUtils.ts` + `notesStore`)
El área del editor muestra uno o más **paneles** `{paneId, noteId, sectionId?}` (`openPanes` +
`activePaneId`; `activeNoteId` = nota del panel activo y se deriva en cada cambio de layout con
`layoutState()` — mucho código sigue leyendo `activeNoteId`). La misma nota puede estar en varios
paneles, cada uno en su sección. La lógica de layout es pura y testeada (`tests/lib/paneUtils.test.ts`).
- **Indexado por `paneId`**, no por nota: `key`, `data-pane-id`, anchos (`paneWidths`), reordenado
  (`reorderPane`) y el panel activo (anillo + `isPaneActive` de `NoteEditor`, que decide quién atiende
  `Ctrl+T/W/M/F/S/Tab`).
- **`sectionId` del panel = sección que muestra AHORA** (`NoteEditor` llama a `setPaneSection` al
  cambiar de sección, junto a `rememberActiveSection`). Al montar, el editor elige: request pendiente
  → `pendingInitialSectionId` → sección del panel → recordada por nota → primera.
- **Abrir:** `openNoteInSplit(noteId, sectionId?)`. Con sección (Ctrl+click en tag de sección, "Open
  section alongside") → panel NUEVO aunque la nota ya esté abierta; si existe uno exactamente en esa
  nota+sección, lo enfoca. Sin sección (Ctrl+click en nota, "Open alongside", soltar una nota en el
  editor) → si la nota ya está en un panel lo enfoca (abrir la nota entera dos veces solo duplicaría
  la vista). Cierra las vistas a pantalla completa para que el panel se vea.
- **`setActiveNote(id)`** enfoca el panel de esa nota si existe (el split se mantiene) o colapsa a un
  único panel **reutilizando el `paneId` activo** (el editor no se remonta al cambiar de nota, como el
  editor único de antes). `setOpenNoteIds(ids)` (legacy, lo usan overviews/cerebro con `[id]`) reutiliza
  paneles por nota. Hacer clic en un panel inactivo llama a `focusPane(paneId)`.
- **`noteflow:request-section`** acepta `paneId` opcional en el detail. Sin él lo atiende UN solo
  panel: el activo de esa nota, si no el primero de esa nota, y si la nota no está abierta el activo
  (el que `setActiveNote` va a reutilizar). Antes lo atendían todos los editores montados.
- **Borrado de nota / sección:** `removeNotesFromLayout` quita los paneles de la nota y conserva los
  demás (antes un borrado metía una nota "fallback" en el split). Si otro panel/ventana borra la sección
  activa de un panel, `NoteEditor` cae explícitamente a la primera sección y resetea el buffer raw —
  si no, el siguiente tecleo escribiría el texto de la sección borrada en la de fallback.
- `loadNotes` en una recarga completa (pull de sync, otra ventana) **conserva** los paneles abiertos
  y solo poda los de notas desaparecidas (antes colapsaba el split en cada recarga). La restauración
  al arrancar (`uiState.activeNoteId/activeSectionId`) crea el panel inicial con esa sección.
- Guardado sin pisarse entre paneles: ver "Sync entre ventanas" (cola por nota + `updateSection`).
- **Poda de notas vacías y guardados pendientes (`lib/pendingEdits.ts`):** al salir de una nota
  (`setActiveNote` desde la sidebar, `focusPane` al clicar otro panel) `maybePruneOnLeave` borra la
  nota si sigue con título por defecto y secciones vacías (solo ventana principal). Los editores
  guardan con debounce (rich 400 ms, raw 600 ms, título 300 ms) y mientras tanto el store aún tiene
  el texto viejo: tecleando en una nota nueva y clicando otro panel, la nota parecía vacía, se
  borraba y el guardado tardío no encontraba nota (texto perdido). Ahora cada debounce es un
  `createDebouncedSave()` que se registra mientras está pendiente, con la nota/sección **capturadas al
  programarlo** (no al disparar: el panel puede mostrar ya otra nota; reprogramar para otro destino
  ejecuta el pendiente en vez de descartarlo). Invariante: `maybePruneOnLeave` hace
  `flushPendingEdits(noteId)` **antes** de mirar la nota (encola las escrituras) y `pruneEmptyNote`
  corre **en la cola de la nota** (`noteWriteQueue`), detrás de esas escrituras, re-comprueba
  `isPrunable` con el store ya actualizado y no borra si hay un guardado pendiente. `Editor` y
  `NoteEditor` además hacen flush al desmontarse. Cierre de ventanas: los botones de cerrar de la
  ventana de sección y del sticky llaman a `closeWindowAfterSaving()` (flush + espera a que la cola
  se vacíe, máx. 2 s, luego `window.noteflow.close()`; main destruye la ventana con `win.close()`);
  `App` hace además `flushPendingEdits()` en `beforeunload` para el resto de cierres (Alt+F4, salir
  de la app): best effort, el IPC sale tras el handler salvo que haya otra escritura de esa nota en
  vuelo o la nota esté cifrada (la escritura espera a `encryptSections` y puede no salir). Si la nota
  vuelve a ser la activa mientras el prune espera en la cola, no se borra. Tests en `tests/lib/pendingEdits.test.ts`.
- **Sync de contenido externo en los editores (`lib/externalContentSync.ts`):** cuando el store trae
  otro `content` para la sección abierta (otro panel/ventana, pull de GitHub, NoteFlow Cloud realtime,
  CLI), antes se **saltaba** si el editor tenía el foco (para no pisar lo tecleado tras un guardado
  aún en cola) y el efecto no volvía a correr: la siguiente pulsación guardaba el texto viejo encima
  del remoto, sin aviso (bug B1). Ahora cada editor distingue **ecos de sus propios guardados** de
  actualizaciones genuinas:
  - **Outbox:** cada guardado que entrega al store (`recordSave`) se apunta. Comparación **exacta**,
    espacios incluidos (`sameContent`): los ficheros de sección se escriben tal cual, así que indentar la
    primera línea o añadir/quitar una línea en blanco inicial es un cambio que hay que guardar; solo se
    normaliza lo que normaliza una relectura del disco (BOM, CRLF → LF), para que un eco que vuelve vía
    `loadNotes` siga casando. **"No hay nada que guardar"** = igual a lo **último entregado** (`lastHandedOff` /
    `needsSave`: la última entrada del outbox, o el store si no hay nada en vuelo), **no** al store: con
    "ab" aún en cola, Backspace vuelve al "a" del store y ese "a" hay que escribirlo (si no, aterriza "ab"
    y el editor muestra "a"). Lo decide el propio editor (`saveContent` de `Editor.tsx`, `scheduleRawSave`
    del raw y del sticky); por eso `handleSectionContentChange` (NoteEditor) y `handleContentChange`
    (sticky) ya **no** comparan con el store. Lo que no cambia nada no se apunta (no habrá eco, y una
    entrada rancia se tragaría luego una actualización que volviera a él). `OUTBOX_LIMIT` = 200, muy por
    encima de lo alcanzable con guardados con debounce: una entrada desalojada cuyo eco sí llegara se
    tomaría por externa y se fusionaría duplicando texto. Cubre la carrera que motivó
    el salto: edición A → se guarda md_A (cola async; lenta en notas cifradas, PBKDF2) → edición B →
    llega `content = md_A` → es **eco**, se ignora (antes un `setContent(md_A)` perdía B).
  - **Decisión** (`decideExternalContent` / `resolveExternalContent`, tests en
    `tests/lib/externalContentSync.test.ts`): **echo** si coincide con una entrada del outbox (la más
    antigua; se descartan ella y las anteriores) → no se toca nada; **same** si el editor ya lo muestra
    (en rich, también si el doc parseado `eq` el actual: otra serialización del mismo doc no mueve el
    caret); **apply** si no hay edición local en vuelo → se aplica **aunque tenga el foco**; **merge**
    si hay debounce pendiente (`DebouncedSave.isPending()`) **o** un guardado propio aún sin eco
    (outbox no vacío: aplicar tal cual lo quitaría del editor y luego aterrizaría encima del remoto).
    El `base` = lo último que el store confirmó (inicial, eco, apply o merge); cada decisión lo
    rebasa al `incoming`. Un apply solo ocurre con el outbox vacío; un merge lo conserva (los ecos
    tardíos de los guardados en vuelo se siguen reconociendo).
  - **Composición IME** (teclas muertas, acentos): mientras dura no se reemplaza el contenido (rompería
    la composición). Rich: `view.composing` → se difiere como el kanban y se reintenta en
    `compositionend` (+50 ms: ProseMirror lee el texto compuesto poco después); un guardado con algo
    diferido durante la composición se reprograma si lo disparó el **timer**; si es un **flush**
    (desmontaje, cierre de ventana, poda: `SaveRun` = `'flush'`, que `createDebouncedSave` pasa al
    callback) no puede esperar — se escaparía del flush y se perderían las últimas pulsaciones —: funde
    lo diferido aunque haya composición y guarda. Raw y sticky: `compositionstart/end` en el textarea;
    se reintenta al terminar.
  - **`merge3(base, local, remote)`:** diff de líneas propio (Myers tras recortar prefijo/sufijo
    comunes; más de 2000 líneas distintas → un único hunk) + diff3. Cambios en líneas distintas (también
    adyacentes) se funden; el mismo cambio en ambos lados sale una vez; si se solapan **no se pierde
    ninguno**: versión local seguida de la remota (`conflict: true`, sin UI por ahora). El resultado es
    contenido local nuevo: se muestra y se (re)programa su guardado. En rich se fusiona en la
    serialización del editor (`normalize` pasa base y remoto por parse → `htmlToMarkdown`).
  - **Rich (`Editor.tsx`):** `replaceDocKeepingSelection` reemplaza solo el rango cambiado
    (`findDiffStart`/`findDiffEnd`, como hace prosemirror-view; si el slice no reconstruye el doc
    exacto, reemplazo completo), con `preventUpdate` (no dispara el guardado) y `addToHistory: false`
    (Ctrl+Z no revierte en silencio el cambio remoto y lo guarda; el undo de ediciones fuera del rango
    sigue funcionando). Selección: antes del cambio se queda, después se desplaza el delta, dentro va al
    inicio del cambio; no roba el foco. Excepción del kanban: ver "Sync externo con el tablero enfocado".
  - **Raw (`NoteEditor.tsx`):** misma regla para el buffer `rawContent` (sync por `noteId/sectionId`;
    al cambiar de sección se reinicia siguiendo al store). **Toda** edición raw (tecleo, imagen,
    undo/redo propios) pasa por `scheduleRawSave`, así "hay edición local" = `rawSave.isPending()`. El
    `onBlur`, cambiar de sección, duplicar y salir de raw hacen **`rawSave.flush()`**: escriben solo una
    edición real, nunca el buffer "porque difiere del store" (antes desenfocar un textarea desfasado
    pisaba el remoto). El caret se conserva mapeando por prefijo/sufijo común
    (`mapOffsetThroughChange`, en el texto mostrado con `[image]`), restaurado en un `useLayoutEffect`.
    Al aplicar/fusionar contenido externo se **vacía** el historial undo/redo raw de esa sección (en vez
    de apilar el texto previo): Ctrl+Z no debe revertir en silencio el cambio remoto y guardarlo (y la
    coalescencia de 500 ms podía restaurar un estado anterior al cambio). Misma regla que el rich.
  - **Sticky raw (`StickyApp.tsx`):** antes escribía cada pulsación sin debounce (el eco de una
    anterior reseteaba el textarea y la siguiente guardaba sin los caracteres de en medio; además
    desbordaba el outbox). Ahora usa su propio `createDebouncedSave` (600 ms, como el raw de
    NoteEditor): `pending` real, y lo vacían el botón de cerrar (`closeWindowAfterSaving` →
    `settleNoteWrites`), `beforeunload`, el `onBlur` del textarea y el desmontaje.
  - **Recarga completa sin ir hacia atrás:** ver "Sync entre ventanas" (`keepNotesChangedDuringLoad`).
  - **Título:** sin cambios — el borrador sigue al store salvo si está sucio y enfocado; todo paso de
    sucio a limpio escribe el borrador (debounce o blur), así que una actualización saltada nunca se queda sin reaplicar
    (un renombrado remoto concurrente con un borrador sucio es last-writer-wins).

### Ventanas de sección ("Open in new window")
BrowserWindows extra (`createSectionWindow()` en main) que cargan la app con
`#section-window?noteId=…&sectionId=…` → `SectionWindowApp`: barra de título propia (Nota · Sección,
minimizar/maximizar/cerrar vía IPC — `window:maximize` actúa sobre la ventana emisora) + `NoteEditor`
(`standalone`: oculta "note overview" y "export", que necesitan el shell principal) en un único panel
fijo. Normal (no `alwaysOnTop`), redimensionable, frameless; `close` la destruye. Se abren desde el
menú contextual de sección (esa sección), el menú contextual **de nota** (no hay ventana "de nota": es
la misma, que ya muestra la nota completa con sus tabs; se abre en la sección en que se abriría la nota
—`activeSectionByNote[noteId]` si sigue existiendo, si no la primera—, mismo orden que `NoteEditor`) y
la paleta (sección del panel activo, `getActiveSectionTarget()`); a
propósito NO desde el menú ⋯ del editor, y nunca para notas cifradas (ver "Sync entre ventanas":
si llega una, `EncryptedReadOnlyView` la muestra en solo lectura).
- **Una por nota+sección:** main guarda `sectionWindows: Map<BrowserWindow, {noteId, sectionId}>`; el
  renderer informa de la sección actual (`window:section-window-target`) y la refleja en el hash
  (`history.replaceState`), así reabrir la misma sección enfoca la ventana y una recarga vuelve a ella.
- **Rol de ventana:** `App` fija `setWindowRole('section')` antes del primer render. En ese rol el store
  no lee/persiste `uiState` (`saveUiState` no-op), no programa alarmas, no poda notas vacías y, si la
  nota desaparece, el panel se vacía (estado "note not found") en vez de saltar a otra nota. No monta
  `TitleBar` (comprobación de updates, botón de sync) ni los listeners de IA. Sync GitHub/Cloud,
  indexado IA, auto-update y motor de alarmas viven en main y no dependen de la ventana. La ventana
  de chat despegada (`#ai-chat`, ver `ai.md` → Chat en el editor) reutiliza este mismo rol `'section'`.
- La ventana **sigue a su panel** (no al hash): un clic en una pill de relación hacia otra nota navega
  dentro de la propia ventana (con un `noteId` fijo el editor quedaría en una sección de otra nota).
- Recibe `notes-updated` como cualquier ventana (filtrado por `windowId`) y carga grupos, plantillas
  (necesarias: "Save as template" reescribe `templates.json` entero) y colores de sección. Tiene su
  propio handler de atajos (`Ctrl+T/W/M/F/S/G`); no hay paleta ni `Ctrl+N`.


### Motor de alarmas y notas temporales (en main)
`setInterval` cada 60s ejecuta `checkAlarms()` + `maybeCheckExpiredNotes({kind:'timer'})` (este
último también una vez al arrancar):
- **Alarmas:** el renderer recolecta deadlines/alarmas de los task items (`alarmUtils.ts`:
  `TASK_ALARM_RE` sobre el markdown de cada sección; línea de tarea con o sin indentación —
  subtareas y tarjetas kanban incluidas —, `📅` seguido de `⏰` en la misma línea, también `[x]`;
  ventana −24h…+7d) y las envía con `alarms:schedule`; el main dispara `Notification` nativa cuando vence (incluye las ya
  vencidas/perdidas al registrar).
- **Notas temporales:** `checkExpiredNotes()` lee cada `note.md` del **disco local** y, si casa
  `/^expiresAt:/m` con fecha vencida, borra la carpeta y llama a `scheduleDeleteDir` del backend de
  sync activo — borrado remoto **incondicional** (no compara `updated` y, a diferencia de los
  pushes, no espera al primer pull).
- **⚠️ Cuándo se ejecuta — gate por pull (`electron/tempNoteExpiry.ts`, puro y testeado):**
  `maybeCheckExpiredNotes(trigger)` decide con `shouldRunExpiryCheck(trigger, {backend, connected})`
  del `getActiveSyncProvider()`. `connected` = `isConnected()` del provider, **salvo Cloud, que cuenta
  como conectado siempre que esté habilitado** (aunque aún no haya sesión: si no, el timer caducaría
  y journalaría un borrado remoto en esa ventana):
  - **Sin sync conectado:** como siempre — al arrancar y cada 60s (trigger `timer`).
  - **Con sync conectado (GitHub o Cloud):** el timer **no** la ejecuta nunca (ni al arrancar ni tras
    despertar). Solo corre **justo después de un pull completo del backend activo**: sin `errors` **y**
    sin `incomplete` (campo opcional de `SyncPullResult`, hoy solo lo pone GitHub cuando el listado
    del tree viene **truncado** o falla el GET de un `note.md` que sí está en el tree — `getRemoteFile`
    se traga los errores y devuelve `null`; antes ese dir se saltaba en silencio y el pull salía
    "limpio". Va aparte de `errors` porque estos se muestran tal cual en Settings → Sync y un GET
    transitorio no es accionable) — trigger `pull`, emitido por `expireNotesAfterPull()` desde `broadcastPullResult(result,
    backend)` (autosync GitHub, ciclo Cloud, pull inicial de arranque de ambos, pull tras managed
    unlock, enable de Cloud) y desde `githubManualPull`/`cloudManualPull`. Corre **después** de que
    `pullNotes` haya escrito las carpetas, así que si otro dispositivo la hizo permanente, el
    `note.md` ya no tiene `expiresAt` y no se toca.
  - **Por qué:** un dispositivo con la copia temporal obsoleta (p. ej. la hicieron permanente en otro
    mientras este dormía, o hace 3 min y aún no ha tocado el pull de 5 min) la borraría en local **y**
    en remoto, y el resto la perdería en su siguiente pull. Un pull completo ha reconciliado **cada**
    carpeta de nota del remoto (las que se salta es porque su `note.md` no cambió desde la última
    reconciliación — sha cache en GitHub, cursor en Cloud — o tienen un borrado pendiente), y con LWW
    por carpeta la copia local queda al menos tan nueva como la remota: un `expiresAt` que siga en
    disco es uno con el que el remoto coincide. Cubre arranque, resume y equipos encendidos sin
    estado extra ni `powerMonitor`. **Cloud:** una fila que no descifra, o cuya carpeta falla al
    aplicarse, entra en el **retry set** (`cloudSync.pullRetry`) y cada pull la vuelve a pedir: o
    se aplica o vuelve a fallar (y ese pull sale con errores), así que no hay pulls "limpios" sin
    haberla aplicado. Excepción residual: una fila que no descifra se abandona tras 5 intentos (y
    las de ruta insegura nunca se reintentan) — ver `sync.md` § Cloud Sync.
  - **Contrapartidas (intencionadas):** con sync conectado una temporal se borra **hasta un intervalo
    de pull tarde** (~5 min). Si los pulls **fallan o salen incompletos** (offline, claves de Cloud
    bloqueadas en e2ee, Cloud habilitado sin sesión, un error persistente en cualquier carpeta, un
    repo tan grande que GitHub trunca el tree) las temporales **no caducan** hasta un pull completo;
    no hay fallback que borre igualmente. Un pull **manual de GitHub con Cloud activo** no cuenta (no
    dice nada de lo que tiene Cloud). El pull interno del Device Flow (`githubSync.ts`) no dispara la
    comprobación; la hace el siguiente tick del autosync.
  - **Riesgo residual:** hacerla permanente en A segundos antes del vencimiento (antes de que el push
    debounced de A llegue al remoto y B haga pull) aún puede perderla; y si B editó su copia temporal
    después que A, gana B por LWW (con `expiresAt`). No se guarda el `scheduleDeleteDir` contra el
    remoto: la interfaz `SyncProvider` no expone leer un `note.md` remoto y, con el gate, sería
    redundante salvo en esa ventana de segundos.
- **Hacer permanente** (`notesStore.makeNotePermanent`, mini menú junto a `Deletes …` del editor —
  `src/components/Editor/TempNoteExpiryMenu.tsx`): saca `expiresAt` del
  objeto por desestructuración (no `= undefined`, para que ningún spread posterior lo resucite) y
  reescribe solo `note.md` con `updated` nuevo (gana el conflicto por carpeta en el pull de los
  demás). Al no haber línea `expiresAt:`, el main ya no la toca; grafo/related/link picker/chat la
  incluyen al siguiente render (filtran en vivo, nada lo cachea).
- **Reprogramar** (`notesStore.setNoteExpiry(id, hours)`, mismo mini menú, opciones
  `TEMP_NOTE_EXPIRY_HOURS` = 1/8/12/24/48 h de `src/lib/dateUtils.ts`): fija
  `expiresAt = hoursFromNow(hours)` con el mismo patrón (cola de escritura, solo `note.md`, `updated`
  nuevo). No-op si la nota no es temporal (nunca convierte una normal en temporal). La granularidad
  real del borrado es la del chequeo del main: ≤60s sin sync, hasta un intervalo de pull (~5 min) con
  sync. Mismo riesgo residual que hacerla permanente: alargarla en A justo antes de que
  venza la copia de B, antes de que el push de A llegue, puede perderse frente al pull de B.

### Auto-update in-app
`app:check-update` consulta la última release (API GitHub, endpoint `/releases/latest` → **ignora
prereleases**; compara con `latest !== current`, así que cualquier versión local distinta dispara
el update — útil para probar el flujo bajando a una versión inferior a la publicada). **Un chequeo
fallido no es "al día":** sin red, timeout, status no-2xx (p. ej. el 403 del rate limit), cuerpo
ilegible o sin `tag_name` → `{hasUpdate: false, error: true}` (`buildUpdateCheckResult` /
`UPDATE_CHECK_FAILED`, puros en `updateAsset.ts` y testeados); Ajustes → Acerca de muestra
"Couldn't check for updates" + pista de conexión con el botón aún clicable para reintentar (antes
mostraba "Up to date"), y la titlebar simplemente no ofrece update. La elección
del artefacto es lógica pura en **`electron/updateAsset.ts`** (`pickUpdateTarget`, test en
`tests/electron/updateAsset.test.ts`); `main.ts` solo sondea el entorno. Los nombres deben casar
**exactamente** con los publicados (un nombre mal es un 404 y el bug viaja en la versión VIEJA, así que
solo se arregla un release después): Windows `NoteFlow-${latest}-Setup.exe`, macOS
`NoteFlow-${latest}-arm64.dmg` (solo Apple Silicon), y en Linux, por orden:
1. Corre desde **su propio** AppImage (`isRunningFromOwnAppImage`: `$APPIMAGE` y `$APPDIR` definidos
   **y** `process.execPath` dentro de `$APPDIR`, comparado por segmentos de ruta) →
   `NoteFlow-${latest}.AppImage` (**sin** `-x86_64`). Gana sobre Debian: un AppImage en Ubuntu se
   actualiza a sí mismo. `$APPIMAGE` solo **no basta**: el runtime lo exporta a todos los hijos, así
   que un NoteFlow `.deb` lanzado desde otro AppImage (terminal, launcher) lo hereda.
2. **Debian-based** (`/etc/debian_version`) → `noteflow_${latest}_amd64.deb`. **No** se usa
   `/usr/bin/dpkg` como señal: en Arch puede estar instalado desde AUR y un `dpkg -i` ahí se salta pacman.
3. Resto (Arch, Fedora, build desde fuentes…) → **URL de la página de releases**
   (`RELEASES_PAGE_URL`). No hay paquete pacman/rpm publicado. Esa URL **no pasa la allowlist** a
   propósito: `downloadAndInstall` devuelve `{ success: false }` y el renderer (TitleBar/AboutPanel) cae
   a `openUrl(downloadUrl)` → se abre en el navegador, sin toast de error.
`app:download-and-install` descarga el artefacto con una **allowlist estricta de hosts**
(github.com + objects/release-assets de githubusercontent.com) y de ruta+extensión
(`isAllowedUpdateAssetPath`: la ruta debe **empezar** por `/yagoid/noteflow/releases/` y acabar en
`.exe`, `.deb`, `.appimage` o `.dmg`, todo **case-insensitive**), emite `update:download-progress` durante la descarga y
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
- **Linux deb:** `pkexec dpkg -i` (el diálogo de PolicyKit pidiendo root es esperado e inevitable:
  instalar a nivel de sistema requiere elevación), con fallback a `shell.openPath` si `pkexec` no
  está; al instalar hace `app.relaunch()` + `app.quit()`. (La rama pacman se eliminó: nunca se ha
  publicado un `.pkg.tar.zst`.) Cualquier otra extensión en Linux → `shell.openPath`.
- **AppImage:** reemplazo en sitio — copia al dir de `$APPIMAGE`, `chmod +x`, **rename atómico**
  sobre el original (no sobreescribe el inodo en uso → no corrompe el proceso vivo) + relanzamiento
  con un **`/bin/sh` desacoplado** (`relaunchAppImageAfterExit` en `main.ts`) + `quit()`. Solo si
  `isRunningFromOwnAppImage` (misma guarda que el check): si no — dev, `.deb` lanzado desde otro
  AppImage con `$APPIMAGE` heredado, empaquetado raro — cae a `shell.openPath` en vez de renombrar
  NoteFlow encima del fichero de otra app.
  **Por qué no `app.relaunch({execPath})`:** en Linux Electron relanza mediante un helper que es
  `/proc/self/exe`, es decir, el binario **dentro del montaje FUSE del AppImage viejo**
  (`/tmp/.mount_XXX`); al salir la app el runtime del AppImage desmonta eso y el helper muere antes de
  arrancar el nuevo (visto en CI, ubuntu-latest con FUSE: nunca relanzaba). Con
  `APPIMAGE_EXTRACT_AND_RUN=1` el dir extraído sobrevive y sí funcionaba, por eso no se vio en WSL. El
  `sh` vive fuera del montaje: espera (`kill -0` cada 0,2 s, tope ~30 s por si el pid se atasca o se
  reutiliza) a que el pid del main haya muerto —para que la nueva instancia no pierda
  `requestSingleInstanceLock()` contra la moribunda— y hace `exec` del AppImage nuevo, sin args. El pid y
  la ruta van como `$1`/`$2` (nunca interpolados en el script). Entorno: se quitan
  `APPIMAGE`/`APPDIR`/`ARGV0`/`OWD` y, en cualquier variable `:`-separada, las entradas bajo el `$APPDIR`
  viejo (`PATH`, `LD_LIBRARY_PATH`, `XDG_DATA_DIRS`, `GSETTINGS_SCHEMA_DIR`…; si queda vacía se
  elimina); el resto intacto (`NOTEFLOW_NOTES_DIR`…). El cwd del helper sale del montaje si estaba
  dentro (→ home). Constructores puros y testeados en `updateAsset.ts` (`appImageRelaunchSpawnArgs`,
  `sanitizeAppImageEnv`, `appImageRelaunchCwd`). Si el `spawn` falla (síncrono o evento `error`) se
  recurre a `app.relaunch({execPath})` y se loguea.
- **macOS:** la build **no está notarizada**, así que no se usa Squirrel.Mac. Se hace
  `shell.openPath(dest)` para **abrir el `.dmg` en Finder** + una `Notification` "Drag NoteFlow to
  Applications"; el usuario arrastra a Applications y relanza a mano (la app NO sale). Reemplazo
  automático descartado por no poder probarse a ciegas.

> **Test E2E:** `scripts/update-e2e.cjs` (+ workflow `update-e2e.yml`) prueba el botón de update de
> punta a punta en Windows/AppImage/.deb sobre builds empaquetadas reales, con un feed de release
> falso que intercepta este `https.get` y este `net.fetch` (comentario de acoplamiento en `main.ts`).
> Uso, escenarios y tabla KNOWN BROKEN: `release.md` § "Test E2E del updater". El contrato
> nombres-de-asset ↔ config de electron-builder también está en `tests/electron/updateAsset.test.ts`.
> **Verificado en runtime (2026-10-25, en local):** Windows 2.0.0→2.1.0 y 2.1.0→2.1.0-e2e.1, y
> AppImage (WSL, **extraído** con `APPIMAGE_EXTRACT_AND_RUN=1`) 2.1.0→2.1.0-e2e.1, en verde; AppImage
> desde 2.0.0 = KNOWN BROKEN, como se esperaba. **En CI** (run 40220133234, AppImage montado con FUSE)
> el escenario B del AppImage **falló**: el fichero se reemplazó bien (sha256 del target) pero NoteFlow
> no se relanzaba (el `app.relaunch` de entonces; ver el bullet AppImage arriba). Corregido con el
> helper `/bin/sh`, **confirmado en CI** (run 40223589595, 2026-10-25: Windows, AppImage montado y
> `.deb` en verde en ambos escenarios; AppImage desde 2.0.0 = KNOWN BROKEN). (Ninguna
> versión publicada lleva el reemplazo en sitio con el relanzamiento roto: la última, v2.0.0, ya es
> KNOWN BROKEN en AppImage por otro motivo.)
> El `.deb` (`app.relaunch()` sin `execPath`, binario en `/opt`) **sí relanzó** en esa ejecución de CI. macOS (dmg en Apple Silicon
> real) sigue **sin probar en runtime** (sin Mac) — ver el bloque de soporte macOS más abajo.

> **v2.0.0 y anteriores** construían mal la URL en AppImage (`-x86_64`) y en Arch (`.pkg.tar.zst`
> inexistente): esos usuarios tienen que actualizar a mano una vez; el updater corregido solo ayuda
> a partir del siguiente salto. Ver "Puntos conocidos para las notas de release" en `release.md`.

`NOTEFLOW_NATIVE=1` (lo setea el wrapper
del PKGBUILD) hace que la app trate la instalación nativa de Arch como `isPackaged` para rutas de
iconos y modo no-dev. El `PKGBUILD` está **roto/no soportado** ahora mismo (ver `release.md`).

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
`folders`, `folder create/rename/delete`, `login` (también en dos pasos: `--no-wait`/`--finish`),
`logout`, `push`, `pull`/`update`, `status`,
`cloud login/logout/status/setup/push/pull` (cliente NoteFlow Cloud headless — ver
`monetization.md` § 4 "Cliente CLI (headless)"; con sesión Cloud activa, `push`/`pull`/`status` y el
sync automático van a Cloud en vez de a GitHub), `migrate`, `self-update`.
Todo se direcciona **por nombre** (título de nota + nombre de sección), nunca por id; los nombres de
sección **no son únicos** → se desambiguan con un sufijo 1-based `#n` (p. ej. `Tasks#2`). La
resolución de sección (`matchSectionOrNull`) es única para todos los comandos: **nombre exacto**
(case-insensitive) + `#n`, y varios homónimos sin `#n` **fallan en vez de adivinar**. La coincidencia
**laxa** (`looseSectionMatches`: subcadena y, si no hay ninguna, `fuzzySectionMatches` — sin acentos
ni mayúsculas, tokens y stopwords fuera) es opt-in con `{ loose: true }` y **solo** la activan `read`
y `path` —de lectura—: gana si el candidato es único y se avisa por **stderr** para no ensuciar el
stdout verbatim. Los que escriben o destruyen **no** la usan (bug real: `set <nota> EN` sobrescribió
`Comentario` porque `"comentario".includes("en")`). **Desde v2.5.0, `set` y `add --section` son
estrictos:** sin match exacto **fallan** (exit 1, nada escrito; `failUnknownSection`) con
`Did you mean "…"?` + `Existing: …` — antes creaban la sección y un typo (`Improvement` por
`Improvements`) dejaba secciones basura. Las sugerencias (`sectionSuggestions`) son los candidatos
laxos y después los parecidos por ortografía (`editDistance`, distancia OSA ≤1 para ≤4 letras, ≤2
para más; nada por ortografía con <3 letras) — **solo se sugieren**, nunca se usan. Con `--json` el
error sale **además en stdout** como `{ error, code: "section_not_found", note, section, sections,
suggestions }` (es el único error del CLI en JSON: la vía de autocorrección de un agente); `--dry-run`
lo reproduce. **`--create`** = "crea lo que falte" (en `add`, nota de `--title` y/o sección; en
`set`, solo la sección — la nota tiene que existir); al crear con parecidas lo avisa por stderr
(`similarSectionsNote`: `Note: no section named "EN" — created it. Similar existing: …`; `would
create` con `--dry-run`). `section add` siempre crea (admite homónimos). `section rename`/`delete`
fallan sin match exacto con la lista de secciones y un `Did you mean: …?` (`resolveSection`), nunca
actúan sobre el candidato. ⚠️ En `cmdAdd` el default implícito `Note` (sin `--section`) va por una
rama aparte: exacto-o-crear **sin** `--create`, **sin** aviso de parecidas (sería ruido en cada
append a la nota diaria con `Meeting Notes`) ni parseo de `#n`/salida por homónimos — no unificar las
dos ramas. Una nota que se crea en ese mismo comando (diaria auto-creada o `--title` + `--create`)
crea su sección sin más.
**Modo de las secciones nuevas (v2.5.0): modo markdown** (`isRawMode` no se escribe en `note.md`;
mismo default que `defaultSections()` de la app y las tools `create_note`/`add_section` del agente) en `add`/`set`/`new`/`section add`; `--raw`
fuerza modo texto; `--markdown` y `--rich` (alias histórico, se mantiene) son el default explícito.
Las secciones existentes nunca cambian de modo. `migrate` (v1→v2) crea la `Note` de una nota v1 solo
con cuerpo en modo markdown, igual que `parseLegacyNoteRaw` del escritorio (antes el CLI la ponía en
modo texto).

**Versionado del CLI y su skill — siempre la misma versión.** `CLI_VERSION` (`cli/noteflow.js`), el
marcador `// v` de su cabecera y el `version:` del frontmatter de `cli/noteflow-cli/SKILL.md` llevan
**el mismo número**, y se suben juntos: cambio de comportamiento del CLI → semver del CLI (minor/major) en
los tres sitios; cambio solo de redacción de la skill → patch en los tres. (La skill ya no trae un ejemplo
de salida de `noteflow version` desde v2.6.0; si se vuelve a añadir, entra en el mismo bump.)
**Independiente de la versión del escritorio** (`package.json`): el CLI tiene canal propio
(`self-update` baja `noteflow.js` —y refresca la skill instalada— de `main` sin release de la app), así
que no van a la par. `self-update` compara el fichero entero, no la versión.
Pensado para
agentes de IA: **`read`** imprime contenido raw apto para pipe (vs `get`, decorado para humanos) y
**`set`** sobrescribe una sección (vs `add`, que solo añade al final). Como el CLI no tiene
find-replace, para **ediciones parciales** existe la vía sin round-trip: **`path`** imprime la ruta
absoluta del `.md` de una sección (o del dir de la nota) para que el agente lo edite con sus propias
herramientas, y **`touch`** cierra el ciclo — relee la nota de disco (obligatorio: `writeNoteFolder()`
reescribe cada `<secId>.md` desde `note.sections[].content`, así que una copia vieja pisaría la
edición), bumpea `updated:` y hace `syncPushNoteFiles` de `note.md` + todas las secciones. El
detalle de cada comando vive en **`noteflow help <comando>`** (`cmdHelp`).

**Criterio de la skill `cli/noteflow-cli/SKILL.md` (~300 líneas, desde 2026-11).** La lee un agente
cualquiera en el equipo de un usuario final, sin el repo ni `.agents/context/` (la app y el instalador
headless la copian solos a los dirs de skills de los agentes, ver "Auto-instalación de la skill" abajo). Recoge **solo lo que el CLI no avisa por sí solo** —fallos silenciosos (sync
con exit 0, `set` reemplaza, truncado de `noteflow.cmd`, `touch` obligatorio y que borra `.md`
sueltos, app abierta pisando grupos/carpetas, `--force`, `pull` de GitHub sin borrados…), modelo mental,
chuleta de una línea por comando, checklist y protocolos de sync—; lo que el CLI ya bloquea con un
error autocorregible (`Did you mean`, flag desconocido, uso incorrecto) se resume en "lee el error".
Detalle útil que no sea un riesgo → a `cmdHelp`, no a la skill (las pruebas con modelos pequeños
mostraron que fallan por olvidar reglas enterradas en un fichero largo). Antes de quitar un aviso,
rastrea con `git log -S` por qué se añadió.

**Salida del proceso: nunca `process.exit()`.** En Windows (visto con Node 24) un `process.exit()`
con un socket keep-alive de `fetch`/`https` aún abierto aborta a veces con la aserción de libuv
`!(handle->flags & UV_HANDLE_CLOSING)` (`src\win\async.c`) y exit **127** en vez de 1 (reproducido:
casi siempre tras una respuesta HTTP completa con keep-alive). Todo error pasa por `exit(code)`:
fija `process.exitCode` y lanza un `CliExit` que sube hasta el handler de `main()`, y Node sale **de
forma natural** al vaciarse el event loop (los sockets keep-alive ociosos están `unref`, no hay
espera). Como `process.exit`, `exit()` no retorna; ⚠️ un `try/catch` que lo envuelva se lo
tragaría → mantener `exit()` fuera de bloques `try`. Un comando que otro invoca como paso
**best-effort** lanza `Error` en vez de llamar a `exit()` (el handler de `main()` lo convierte en
`Error: …` + exit 1, idéntico a `err()+exit(1)`): así `cmdPull` puede usarse tras `login` y un fallo
del pull no parece un login fallido (el llamador lo captura y re-lanza solo los `CliExit`). Dos redes en el handler de `main()`: un
`setTimeout(process.exit, 3000).unref()` (solo se arma tras un error; actúa si un handle suelto mantiene vivo el loop, p. ej. en Windows un pipe de stdin que el padre deja abierto tras un prompt) y un
`beforeExit` que, si el loop se vacía con `main()` aún pendiente (una promesa que nunca se resuelve),
lo reporta como error con exit 1 en vez del exit 0 silencioso.

**Prompts interactivos.** Todos (`promptLine`, `promptHidden`, `confirm`) pasan por
`readPromptLine()`, que resuelve `''` con una línea vacía y **`null` si stdin está cerrado** (EOF de
un pipe, Ctrl+D, o Ctrl+C que cierra el readline): `rl.question()` nunca llama a su callback en EOF,
así que antes la promesa quedaba colgada y el CLI terminaba en silencio con exit 0. `promptUntil()`
re-pregunta ante vacío/formato inválido (5 intentos) y lo usa `cloud login` para email y código OTP
(de 6 a 10 dígitos —la longitud la fija GoTrue; el proyecto envía 8—, se ignoran espacios/guiones; solo un código bien formado gasta un `/verify`, con hasta 3
intentos en total ante `otp_expired` sin reenviar el email). `confirm()` con stdin cerrado = "N" + aviso de
`--yes`. Readline es **uno por prompt**: con stdin por pipe, las líneas que ya leyó un prompt se
pierden al cerrarlo — el CLI no soporta responder a varios prompts por pipe (para scripts:
`--yes`, `NOTEFLOW_CLOUD_PASSPHRASE`).

**Logins en dos pasos para agentes (v2.6.0).** Un agente de IA no tiene stdin (el `cloud login`
interactivo sale con exit 1 sin él) ni puede dejar un comando bloqueado ~15 min (el polling del
Device Flow de `login`). Por eso ambos logins tienen una variante no interactiva y no bloqueante,
y al humano solo le queda autorizar en GitHub o dar el código del email:
- **Cloud:** `cloud login <email> --send-code` envía el OTP y sale con 0; `cloud login <email>
  --code <código>` **no** reenvía email, normaliza con `normalizeOtpCode` y gasta **un** `/verify`
  (inválido/caducado → exit 1, reintentable con el mismo código o con un `--send-code` nuevo). La
  validación de flags (`planCloudLogin`: email obligatorio como argumento, `--send-code` ⊕ `--code`)
  es pura; `sendCloudOtp`/`verifyCloudOtp` son comunes, y lo que pasa tras obtener la sesión
  (`finishCloudLogin`: `saveCliAccount`, `bindCliCloudToAccount`, `patchCliCloud`, línea `Cloud
  keys:`, pull en managed, `--no-pull`) es **la misma función** para el flujo interactivo y `--code`.
- **GitHub:** `login [repo] --no-wait` pide el device code, lo imprime (abre el navegador
  best-effort; con `--json`, `{ verificationUri, userCode, expiresAt, repo }`) y guarda la concesión
  pendiente en `settings.cliGithubLogin` (`{ deviceCode, userCode, verificationUri, interval,
  expiresAt, repo, owner?, noPull? }`, clave propia del CLI, `writeSettings` → 0600). `login --finish` la
  valida (`checkPendingGithubLogin`: ausente/mal formada o caducada → exit 1 pidiendo `--no-wait`
  otra vez), hace el polling con el **primer intento inmediato** (respeta `interval`/`slow_down`) y
  sigue por `completeGithubLogin`, el mismo final que el login interactivo (owner, `ensureRepo`, reglas
  `sameRepo`/`clearGithubBases`, `pullAfterLogin`). El pendiente se borra en cuanto el polling
  termina (token concedido, caducado o error definitivo como `access_denied`). Un fallo de red
  **durante el polling** (o que el timeout de la herramienta del agente corte el comando) lo
  conserva y basta repetir `--finish`. Uno **después** de recibir el token (`GET /user`,
  `ensureRepo`) ya no: GitHub da un token por device code, así que el pendiente se borra antes de
  conectar y un `--finish` repetido dice `No pending GitHub login` → empezar con `--no-wait`. **Repo con `--finish`:** manda el del pendiente; uno distinto es error sin tocar nada
  (`resolveFinishRepo`) — nunca se cambia de repo en silencio.
- **Pista `desktopApp` en `status --json`/`cloud status --json`** (aditiva): `{ cloudSignedIn,
  cloudSyncEnabled, cloudEmail?, github: { owner, repo } | null }` leído del `settings.json` de la app (`desktopSettingsCandidates`:
  `<appData>/NoteFlow/settings.json` — el userData de Electron usa el `productName`; en Windows es
  el mismo fichero que el del CLI, en macOS/Linux otro), `null` si no se encuentra. En Linux **no**
  se mira `~/.config/noteflow` como respaldo: es el fichero del propio CLI y existe sin la app (daría
  un falso "no" en vez de `null`). Única excepción
  a "nunca leer `settings.account`": solo la **presencia** de la sesión (misma regla que
  `getAccountStatus`: refresh token + userId) y el email, que la app guarda en claro; el token no
  sale. `github` = owner/repo del `githubSync` de la app (sin token): en Windows el caso GitHub ya
  se ve con `github.tokenAccessible: false`, pero en macOS/Linux el `githubSync` del CLI vive en
  otro fichero y esta es la única forma de saberlo. Así el agente propone al usuario el mismo
  backend que usa en la app. Protocolo del agente en la skill (`cli/noteflow-cli/SKILL.md`
  § "Ofrécete a activar el sync"). Tests en `tests/cli/agentLogin.test.ts`.

**Escrituras estrictas: nada de fallos silenciosos (v2.8.0).** Pruebas con un modelo pequeño
siguiendo la skill destaparon casos que "salían bien" con un resultado equivocado; el criterio es
**arreglarlo en el CLI** (error con exit 1 antes de escribir) en vez de avisarlo en la skill:
- **`login owner/repo`:** el argumento es `repo` u `owner/repo` (`parseRepoSpec`: nombres
  `[A-Za-z0-9._-]+`, como mucho una `/`), validado **antes** de pedir el device code (también con
  `--no-wait` y `--finish`). Tras `GET /user`, un owner distinto (sin distinguir mayúsculas) de
  `user.login` → exit 1 **antes** de `ensureRepo` y de `writeSettings` (`loginOwnerError`): el CLI
  solo sincroniza repos de su propia cuenta. Antes `ensureRepo(…, "ana/notas")` fallaba el GET y
  creaba un repo con nombre equivocado. El owner viaja en el pendiente (`owner?`) y
  `resolveFinishRepo` lo compara. Por eso, para conectar un repo **existente** (caso (b) de la
  skill: el mismo que usa la app) se pasa `owner/repo`: con solo el nombre, autorizar con otra
  cuenta haría que `ensureRepo` reciba un 404 y cree `<otra>/<repo>` con exit 0. Sin repo o solo
  el nombre queda para un repo nuevo (caso (a)). Tests en `tests/cli/loginRepoSpec.test.ts`.
- **`ensureRepo` solo crea ante un 404** (`githubRequest` adjunta `status` al error); red, 401 o
  5xx se propagan y el login falla, en vez de crear un repo nuevo y apuntar el sync a él.
- **`add --title`** resuelve como `resolveNote` (`failIfAmbiguousNote`): exacto gana, parcial único
  vale, varios → exit 1 listándolos, **también con `--create`** (sin ninguna coincidencia,
  `--create` crea la nota como siempre). Antes escribía en la primera coincidencia.
- **`add --group/--folder` inexistente** → exit 1 antes de escribir, también con `--dry-run`
  (`resolveGroupPlacement`, compartida con `new`; mismos mensajes que `move`). Antes avisaba,
  escribía sin agrupar y salía con 0. La nota y el grupo se resuelven **antes** de leer el
  contenido (como `set`). Cambiar de grupo sin `--folder` limpia `note.folder` (como `move`; antes
  quedaba apuntando a una carpeta del grupo anterior); el mismo grupo sin `--folder` la conserva.
- **Flags por comando** (`COMMAND_FLAGS` + `unsupportedFlagError`, validado en `main()` tras
  `parseFlags`): un flag conocido que el comando no lee → `Flag --dry-run is not supported by
  'delete'`, exit 1, sin ejecutar nada (antes `delete X --yes --dry-run` borraba de verdad).
  Global solo `--yes` (inocuo donde no hay prompt). `--json` solo en los comandos que emiten JSON
  (`list get read path new add set delete groups folders group create folder create status
  cloud status`, y `login` solo con `--no-wait` vía `loginFlagsError`): en los demás `jsonMode`
  mandaba el texto a stderr y dejaba stdout vacío con exit 0.
  ⚠️ Al añadir un flag a un comando, añádelo a la tabla o se rechazará; los comandos/subcomandos
  desconocidos no se validan (sale su propio error de uso).
- **`--file`/`--stdin` en UTF-16** (`decodeInputBuffer`, en `resolveSetContent` → `add` y `set`):
  se leen como bytes; BOM `FF FE`/`FE FF` → se decodifica UTF-16 LE/BE (lo que escribe el `>` de
  PowerShell 5.1); sin BOM pero con NUL en ≥30% de las unidades de una paridad (`looksLikeUtf16`)
  → exit 1 sugiriendo `| noteflow set … --stdin` u `Out-File -Encoding utf8`. Antes se guardaba
  basura con exit 0. Tests en `tests/cli/strictWrites.test.ts`.

**Shims de Windows (`cli/noteflow.cmd`, `cli/noteflow.ps1`).** PowerShell prefiere el `.ps1` sobre el
`.cmd`, así que el `.ps1` carga con dos rarezas de PS 5.1: (1) en una **tubería** PowerShell se queda
con stdin y node vería EOF → el shim lanza node vía `ProcessStartInfo` y le escribe `$input` como
**bytes UTF-8** (`$input | & node` re-codifica y convierte los no-ASCII en `?`); redirige también
stdout/stderr y reemite stdout por el pipeline de PS (con un handle heredado, `$x = … | noteflow …`
y `> out.json` saldrían vacíos; el stderr de esa rama va a consola y no lo captura `2>&1`). (2) PS
5.1 decodifica la salida del hijo con la **codepage OEM** (`Consideración` → `Consideraci├│n`) → fija
`[Console]::OutputEncoding` a UTF-8 mientras dura la llamada y la restaura al salir. El `--json` ya
era inmune (escapa a `\uXXXX`); esto arregla el texto plano de `read`/`get`/`path`.
⚠️ `self-update` descarga `noteflow.js` (y refresca la skill ya instalada, ver abajo) pero **no** los
shims, así que los shims viejos siguen instalados hasta
actualizar la app → `resolveSetContent()` detecta el caso "stdin vacío en win32" y explica la salida
(`--file`, `noteflow.cmd`, o actualizar).

**Auto-instalación de la skill.** Para que los agentes de IA descubran la CLI sin descargar nada, la
app copia `cli/noteflow-cli/SKILL.md` a `<destino>/noteflow-cli/SKILL.md` en varios dirs de skills de
usuario (`skillAgentDestDirs()` en `electron/main.ts`):
- `~/.claude/skills/` — Claude Code (solo lee esta ruta).
- `~/.agents/skills/` — ruta de usuario del estándar Agent Skills (agentskills.io): la leen Codex (su
  única ruta de usuario), Gemini CLI, GitHub Copilot, Cursor, OpenCode, Devin, Kilo, Augment…
- `~/.codeium/windsurf/skills/` — Windsurf, **solo si ya existe `~/.codeium/windsurf`** (no se crea
  `~/.codeium` en equipos sin Windsurf).

La carpeta `cli/noteflow-cli` se bundlea vía `extraResources` (`package.json`) y en runtime
`syncSkillToAgentDirs()` resuelve el origen: empaquetado → `process.resourcesPath/cli/noteflow-cli/SKILL.md`,
dev → `__dirname/../cli/noteflow-cli/SKILL.md` (`__dirname` = `dist-electron/`). Se ejecuta en cada
arranque (fire-and-forget, best-effort): cada destino va en su propio try/catch (un fallo en uno no
impide los demás) y copia solo si el contenido difiere (auto-cura y recoge updates sin reescribir en
vano). Controlado por el setting local `exposeSkillToAgents` (default `true`) en `settings.json`; al
desactivarlo borra nuestro `SKILL.md` en todos los destinos y la carpeta `noteflow-cli` si queda vacía
(nunca toca nada más). Toggle **"Expose CLI skill to AI agents"** en Settings → General
(`GeneralPanel.tsx`), IPC `app:get-skill-sync` / `app:set-skill-sync`.

**Sin la app (CLI v2.9.0+), los mismos destinos con las mismas reglas** — ⚠️ tres copias de la lista que
hay que mantener en sync: `skillAgentDestDirs()` de `electron/main.ts`, `skillAgentDestDirs()` de
`cli/noteflow.js` y `install_skill` de `cli/install-cli.sh`:
- **`cli/install-cli.sh`** (headless, `curl … | sudo bash`): tras instalar el binario descarga
  `SKILL.md` de `main` y lo copia a los destinos (crea las carpetas; copia solo si difiere, `cmp`). Como
  corre con `sudo`, el home es el del **usuario real** (`SUDO_USER` → `getent passwd`; en macOS `dscl`;
  último recurso `~$SUDO_USER`, con el nombre validado antes del `eval`) y lo que crea se `chown`ea a ese
  usuario (la carpeta más alta que no existía, `-R`; o solo el fichero). Sin sudo usa `$HOME`.
  **Best-effort:** un fallo de la skill avisa y no tumba la instalación del CLI (`install_skill || true`;
  ojo: dentro de una función llamada desde `||`/`if` el `set -e` no aplica → cada paso lleva `|| return 1`).
  Re-ejecutar el instalador = actualizar CLI + skill.
- **`noteflow self-update`** (`selfUpdateSkill()` / `refreshInstalledSkills()`): tras el binario —también
  si ya estaba al día— reescribe la skill **solo donde ya existe `noteflow-cli/SKILL.md`**: nunca la
  instala donde no estaba ni la resucita si el usuario la desactivó en la app (el toggle borra las
  copias). Si no hay ninguna copia, ni descarga. Bajo `sudo` resuelve el home con `SUDO_USER`
  (`skillHome()`); como solo sobrescribe ficheros existentes, conservan su propietario. Best-effort:
  un fallo solo emite un `Warning:` por stderr. Tests en `tests/cli/skillUpdate.test.ts`.
- ⚠️ Con la app instalada, cada arranque re-sincroniza la skill a la versión **empaquetada**: tras un
  `self-update` la skill de `main` dura hasta el siguiente arranque de una app más antigua, que la
  devuelve a la suya (el `noteflow.js` actualizado se queda) — desfase temporal y aceptado.

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

**Tonos de estado en temas claros (`data-color-scheme`):** `applyTheme` (themeStore) pone
`data-color-scheme="dark|light"` en `<html>` (del `colorScheme` del tema). Al final de
`src/index.css` hay un bloque `:root[data-color-scheme='light'] …` que remapea las clases de paleta
fija pensadas para fondo oscuro (`text-yellow-400/500`, `text-amber-100…400`, `text-green-400`,
`text-emerald-400`, `fill-green/amber-400`, conservando el alfa `/80`, `/90`) a los tonos 700/800, y da
algo más de cuerpo a los fondos/bordes tintados de estado (`bg-yellow-500/10`, `border-green-500/30`…).
Así los badges "Activo"/"En pausa", avisos y candados se leen en Arctic Day/Parchment/NoteFlow Light
sin ramificar en cada componente. **Si usas una clase nueva de esas paletas en texto, añádela al
bloque** (o usa un token del tema: `accent-2`/`accent-3`).

Animaciones propias del config: `animate-shake` (nudge horizontal de 0,28 s para un input que acaba
de rechazar un valor, p. ej. el código de sign-in en Ajustes → Suscripción; úsalo con `motion-safe:`).

### Colores del editor (overrides sobre el tema)

Además del acento y la fuente de la app, Ajustes → Apariencia permite repintar **6 colores del
editor** por encima del tema activo (`editorColors` en `src/stores/themeStore.ts`):

| Key (`EditorColorKey`) | CSS var | Fallback del tema | Qué pinta |
|---|---|---|---|
| `h1` / `h2` / `h3` | `--heading-1/2/3` | `--accent` / `--cyan` / `--text` | Encabezados |
| `italic` | `--em-color` | `--purple` | Cursiva (`em`) |
| `inlineCode` | `--code-inline` | `--red` | Código inline (`code`, no el `pre code`) |
| `codeAccent` | `--code-accent` | `--accent` | Borde izquierdo de `blockquote` (label "Quote"; el nombre es histórico: antes también pintaba el borde izquierdo del `pre`, que ya no lo tiene) |

Mecánica (la misma para los 6): el override se guarda como triplete `"r g b"`, como el centinela
`'text'` (ver abajo) o `null` = seguir el tema; se aplica con `setProperty`/`removeProperty` sobre
`document.documentElement` y el CSS usa el fallback nativo (`color: rgb(var(--code-inline, var(--red)))`
en `src/index.css`), así que sin override el color sigue vivo al cambiar de tema. Persistencia: se
sincroniza en **`ui-settings.json`** (`editorColors`, ver `electron/uiSettings.ts`) y además se
*dual-escribe* en `localStorage` bajo la clave **`noteflow-heading-overrides`** (fuente legacy y semilla
de migración) — nombre heredado de cuando solo había H1/H2/H3: se mantiene (en vez de migrar a otra
clave) porque el parser tolera claves ausentes → `null`. La clave se borra cuando los 6 vuelven a `null`.

**Color "texto" adaptativo (centinela `'text'`).** El primer swatch de la fila de acento y de cada fila
de colores del editor es el **color del texto del tema** (`--text`: claro en temas oscuros, oscuro en
claros), para que un color elegido en un tema claro no desaparezca al pasar a uno oscuro. Se guarda
como la cadena **`THEME_TEXT_COLOR = 'text'`** (`src/lib/colorUtils.ts`; espejo en
`electron/uiSettings.ts`, cuyo `sanitizeUiSettings` la acepta en `accent` y `editorColors.*` junto a los
tripletes) y `themeStore` la **resuelve al triplete `--text` del tema activo** al aplicar
(`resolveThemeColor`): `applyTheme` para `--accent` y `applyEditorColors(overrides, theme)` para los 6,
que `setTheme` vuelve a llamar en cada cambio de tema. Decisión: resolver a triplete (y no poner
`var(--text)` en la var) para que `--accent`/`--heading-*` sigan siendo SIEMPRE un `"r g b"` real — hay
consumidores que los leen por `getComputedStyle` y parsean canales (vista cerebro `brainColors`,
`resolveSectionInk` de mapa/overview, el `<input type="color">` vía `rgbTripleToHex`). El panel
(`AppearancePanel`) resuelve igual para swatches, preview y selector libre; el swatch se pinta con
`rgb(var(--text))` y su check con `rgb(var(--bg-1))` (contrasta en ambos casos). Con acento = texto
(blanco en temas oscuros) los rellenos sólidos de acento siguen legibles porque su tinta no es fija:
`--ng-accent-ink` (casillas del overview) se calcula con `resolveSectionInk('--accent')` y el resto usa
`text-surface-0` o son indicadores sin texto encima.

**Compatibilidad de `'text'` (excepción consciente a "todo campo nuevo en ambos espejos", ver
`ui-settings.json` en `architecture.md`):**
- **Móvil (pendiente):** el espejo `noteflow-mobile/src/core/uiSettings.ts` solo acepta tripletes →
  ignora `'text'` (sigue al tema) y lo borra del fichero en su siguiente escritura de apariencia.
- **Escritorio anterior a este cambio:** también lo descarta, y es peor que el móvil: su handler
  `ui-settings:set` hace `mergeUiSettings(readUiSettingsFile(), patch)` sobre el fichero **ya saneado**,
  así que **cualquier** escritura (cambiar tema, tamaño de fuente del editor…) reescribe el fichero sin
  `'text'`.
- **Seed legacy que lo pisa:** cuando la clave `accent` (o `editorColors.*`) queda AUSENTE por lo
  anterior, un equipo que aún tenga un acento antiguo en `localStorage` (`noteflow-accent-override`)
  hará el seed de migración de `initTheme` con ese triplete y **sobrescribirá `'text'` en todos los
  dispositivos** vía sync.
- **Downgrade:** el dual-write deja `'text'` en `localStorage`; una versión anterior que vea la clave
  ausente en el fichero cae a ese valor legacy y aplica `--accent: text` (o `--heading-*: text`), que
  no es un color válido → `rgb(var(--accent))` deja de pintar. (No lo re-siembra: su seed exige
  triplete.)

**Paleta de presets** (`ACCENT_PRESETS`, compartida por acento y colores del editor): 9 tonos de
saturación/luminosidad media — azul, teal, salvia, ocre, terracota, rosa, malva, violeta y gris
pizarra al final — elegidos para dar **≥ 3:1 de contraste contra `--bg-1` y `--bg-editor` de los 14
temas** (claros y oscuros), porque el mismo color se usa en ambos.

### Color de grupos y secciones (paleta del tema + color libre)

Un color de grupo/sección (`GroupColor` en `src/types/index.ts`) es **una de las 8 CSS vars del tema**
(`ThemeColorVar` = `TAG_COLOR_VARS` en `src/lib/tagColors.ts`) **o un hex libre** `CustomColor`
(`'#rrggbb'` en minúsculas). Los pickers (menú contextual de sección —tag o tab del editor—, menú
del grupo en el sidebar y del menú de nota) muestran los 8 presets + el botón *auto*
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

### UI text size (zoom global nativo)

El "UI text size" (Settings → Appearance; pasos en `UI_SCALES`, persistido por dispositivo en
`localStorage` `noteflow-ui-scale`) escala toda la UI con el **zoom nativo de Chromium**:
`applyUiScale` (`src/stores/themeStore.ts`) llama a `window.noteflow.setUiZoom(factor)` →
`webFrame.setZoomFactor` en `electron/preload.ts` (funciona con el preload en sandbox; no hay IPC).
- Se aplica en **cada carga** desde `initTheme()` (`src/main.tsx`, común a todas las ventanas:
  principal, sticky, sección) y **siempre**, también con 1.0, para que un zoom que Chromium haya
  persistido en `userData` para el origen (versiones antiguas fijaban `zoomFactor: scaleFactor`) no
  gane. Por eso `main.ts` **ya no** resetea el zoom en `did-finish-load`: ese evento llega *después*
  de `initTheme()` y deshacía la escala del usuario.
- `webFrame.setZoomFactor` es **por ventana** y no persiste (medido en Electron 35: otras ventanas del
  mismo origen no lo heredan y una recarga vuelve a 1.0). Cambiar la escala en Ajustes solo afecta a la
  ventana principal; las sticky/ventanas de sección abiertas la recogen al recargarse (igual que con el
  antiguo CSS `zoom`).
- **Un solo espacio de coordenadas:** con zoom nativo `getBoundingClientRect()`, `clientX/Y`,
  `window.innerWidth/innerHeight` y `style.left/top` están en los mismos px CSS. Los popups `fixed`
  (`SlashCommands`, `taskBadge.popoverPosition`, `KanbanMenu`, dropdown de `CodeBlockWithCopy`) y los
  arrastres (kanban, tabs) usan los rects tal cual, sin dividir por ningún factor.
- **Por qué no CSS `zoom` en `<html>`** (lo que se hacía antes): en el Chromium de Electron 35 la app
  se maqueta a zoom × alto de ventana (a 1.1–1.25 el fondo del editor quedaba 80–200 px bajo el borde;
  a 0.9 sobraba una franja vacía), y el `scrollRectIntoView` de ProseMirror / `scrollIntoView` nativo
  acababan desplazando ancestros `overflow: hidden` (toda la UI subía, la barra de título
  desaparecía, el caret quedaba pegado al borde y la búsqueda caía fuera de pantalla). Además rects y
  coords de ratón vivían en espacios distintos según la versión de Chromium, lo que obligaba a
  compensar con un factor en cada popup. No reintroducir `zoom` en el root; el `zoom` local de
  `.note-preview`/previews de sección no tiene ese problema y se mantiene.
