---
name: noteflow-features
description: Funcionalidades, diseño de UI y experiencia de usuario de NoteFlow. Úsala cuando el usuario quiera discutir, mejorar o diseñar features de la app, entender cómo funciona desde la perspectiva del usuario, o planear nuevas capacidades de producto.
---

# NoteFlow — Funcionalidades y Diseño

> **Mantenimiento:** al implementar una feature importante, actualizar esta skill **y** la
> documentación de `.claude/context/` (arquitectura/IPC/release — ver el mapa en `CLAUDE.md`). Si
> toca el CLI, también `cli/noteflow-cli/SKILL.md`. La fuente de verdad de los atajos es
> `src/components/Settings/ShortcutsPanel.tsx`.
>
> **Teclas en macOS:** los atajos se documentan con `Ctrl` (Windows/Linux); en macOS `Ctrl` = **⌘
> (Cmd)** — los handlers aceptan `ctrlKey||metaKey`. Excepción: navegar secciones usa el **Control
> literal (⌃)** porque `Cmd+Tab` es el conmutador del sistema. El renderer resuelve las etiquetas con
> `src/lib/platform.ts` (`modKey`/`controlKey`/`keyLabel`, leyendo `window.noteflow.platform`).
>
> **Idioma de la UI:** la app soporta **idioma de interfaz configurable** (inglés y español) desde
> **Ajustes → General**, con opción **System** (sigue el idioma del sistema operativo) y **cambio en
> caliente** (sin reiniciar; incluye el menú del tray y diálogos nativos). Persiste en `settings.json`.
> El inglés es la fuente de verdad de las traducciones (`src/i18n/`). El contenido del usuario y las
> respuestas del LLM van en el idioma del usuario, con independencia del idioma de la interfaz.

## ¿Qué es NoteFlow?

App de escritorio de notas rápidas para Windows/Linux/macOS, orientada a developers. Dark-first, sin
fricciones, accesible desde el system tray en cualquier momento con `Ctrl+Shift+Space`. Notas en
archivos `.md` locales, con sync privado opcional a GitHub y un CLI companion para headless/IA.

---

## Estructura visual de la app

```
┌─ TitleBar (32px) ──────────────────────────────────────────────────┐
│  NOTEFLOW  [🧠 brain] [⬇ update] [☁ sync]        [⚙ settings] [─ □ ×] │
├─ Sidebar (180–480px, redimensionable) ──┬─ Editor area ─────────────┤
│  [🔍 Search...        ] [⮜]            │  [Tabs sección] [⚙]        │
│  [▦ All content]                        │  Título de nota            │
│  ─ Tags ─────────────────────           │  19/03/2026 · 21:00        │
│  [tag1] [tag2] [tag3] ...               │  ──────────────────────── │
│  [+ New note]  [+ New group]            │                            │
│  ─────────────────────────────          │  Contenido (editor)        │
│  favorites                              │                            │
│    NOTEFLOW               20:31 ⭐      │   (Ctrl+Click una nota →   │
│  ─────────────────────────────          │    se abre en paralelo)    │
│  ▼ WORK (grupo)                         │                            │
│    ▼ 📁 Backend (carpeta)               │                            │
│      NOTEFLOW             20:31         │                            │
│         [Urgent][Features]              │                            │
│    Meeting                14:30 ⏱       │                            │
│  ▶ PERSONAL (grupo, colapsado)          │                            │
│  ─ Sin grupo ──────────────────         │                            │
│    Project: Neural Netw…  19/03         │                            │
│  ─────────────────────────────          │                            │
│  ⊞ Show archived       3 notes         │                            │
└─────────────────────────────────────────┴────────────────────────────┘
```

Iconos del TitleBar:
- **⬇ update**: aparece solo si hay una versión nueva; descarga e instala in-app (muestra el %
  de descarga y luego un spinner "Installing…").
- **☁ sync**: estado de GitHub Sync (conectado verde / subiendo girando / error ámbar / off).
- **⚙ settings**: abre la **ventana de Ajustes** (overlay tipo app de settings) con nav izquierda
  + panel derecho, **en General** (la primera de la nav). Secciones, **en el orden en que aparecen
  en la nav**: **General** (idioma de la
  interfaz: System/English/Español; debajo, la sección **Activity**: gráfica monocroma de línea con
  montículos suaves sobre una baseline con la actividad de notas de las últimas 16 semanas
  (cuadrícula tenue con marca semanal, encabezado y leyendas de ejes en HTML —"16 weeks ago"/"Today"—
  porque el SVG se estira; solo lee timestamps, nunca contenido; el gráfico en sí no tiene texto ni
  números); `ActivityPulse.tsx` + `src/lib/activityPulse.ts`), **AI**, **Sync** (NoteFlow Cloud + GitHub), **Account** (cuenta
  NoteFlow), **Appearance** (tema/fuente/acento/colores del editor/escala), **Editor**
  (fuente/tamaño/ancho), **Templates** (plantillas de nota), **Data** (export/import + carpeta de
  notas), **Startup** (autostart + stickies), **Keyboard shortcuts** y **About** (versión + updates +
  repo). Tamaño fijo proporcional a la ventana de la app. El orden vive en el array `NAV` de
  `SettingsModal.tsx`; las labels vienen del diccionario i18n por id. La paleta de comandos y los
  atajos pueden abrirla directamente en otra sección (p. ej. shortcuts, startup, sync).
- Controles de ventana: minimizar / maximizar / cerrar (cerrar = ocultar al tray).

---

## Gestión de notas

### Crear
- `Ctrl+N` → nota nueva instantánea.
- `Ctrl+Shift+N` → **nota temporal** (se autoelimina en 24h).
- Botón `+ New note` en el sidebar. **Click derecho** sobre él → "Temporary note (24h)".
- Desde el tray (menú o `New Note`).

### Organizar
- **Favorites** → aparece en la sección "favorites" al top del sidebar (etiqueta pequeña + notas planas). La nota también sigue visible en su grupo si tiene uno. Toggle desde el menú contextual o el botón ⭐ en la toolbar del editor.
- **Drag-to-reorder** → las notas se pueden arrastrar dentro de su contexto (favorites, grupo, carpeta o sin grupo) para fijar un orden manual. El orden persiste en `note-order.json` (sincronizado con GitHub). Una línea indicadora muestra dónde se insertará la nota al soltar.
- **Drag-to-move (entre grupos/carpetas)** → arrastrar una nota y soltarla sobre **otro grupo** (cabecera o cuerpo) la reasigna a la raíz de ese grupo; soltarla sobre una **carpeta** la mueve a esa carpeta. El destino se resalta con un borde/tinte del color del grupo mientras se arrastra. Reordenar dentro del mismo contexto y mover a otro distinto conviven en el mismo gesto (la cabecera de un grupo colapsado también es zona de drop). Equivale a `updateNote({ group, folder })`; sin IPC nuevo.
- **Archive** → se oculta de la lista principal (toggle "Show archived" en footer).
- **Duplicate** → copia completa con todas sus secciones; conserva el grupo y la carpeta de la original.
- **Open alongside** → abre la nota en paralelo (vista dividida) junto a la actual.
- **Asignar a grupo / carpeta** → drag & drop o menú contextual.
- **Delete** → con confirmación modal.

### Propiedades de una nota
- Título editable (auto-save). Título por defecto: `DD/MM/YYYY`.
- Tags: extraídos automáticamente del contenido con `#nombre`.
- Timestamps: `created` y `updated` automáticos.
- Estado: favorited, archived, encrypted, temporary (`expiresAt`).
- Ubicación: `group` (opcional) y `folder` (opcional, dentro del grupo).

---

## Notas temporales

- Se crean con `Ctrl+Shift+N`, desde el click-derecho en `+ New note`, o con el **botón-icono de
  reloj** (`Timer`) que hay entre `+ New note` y el botón de nuevo grupo en el sidebar.
- Llevan `expiresAt` en el frontmatter (24h desde su creación).
- El proceso principal **borra automáticamente** las vencidas (también del remoto si hay sync).
  Sin sync, comprueba al arrancar y cada minuto; **con sync, solo justo después de un pull que haya
  ido bien** (para no borrar una nota que otro dispositivo hizo permanente), así que puede borrarse
  unos minutos tarde y, sin conexión, no caduca hasta el siguiente pull correcto.
- En el sidebar se distinguen por un icono de reloj (⏱) junto a la hora.
- Dentro del editor, junto a la fecha de actualización se muestra `Deletes <fecha · hora>` (con
  icono de reloj, en tono de acento) indicando cuándo se autoeliminará.
- **Hacerla permanente:** el menú ⋯ del editor muestra **"Make permanent"** (icono `TimerOff`) solo
  en notas temporales. Quita `expiresAt` (bumpea `updated`) y la nota pasa a ser normal: desaparecen
  el badge del editor y el reloj del sidebar, y vuelve a entrar en grafo, related, link picker y
  sugerencias del chat. Sin confirmación (es inocuo). Funciona también con notas cifradas, incluso
  bloqueadas (solo reescribe `note.md`). Solo está en el menú ⋯ (no en el menú contextual del
  sidebar ni en la paleta). Con sync, los demás dispositivos reciben la versión permanente antes de
  poder caducarla (ver `patterns.md` § "Motor de alarmas y notas temporales").
- Las temporales **no entran** en el grafo del cerebro, la vista Related, el link picker de
  secciones ni las sugerencias del chat (filtran por `expiresAt`).

---

## Vista en paralelo (split)

- `Ctrl+Click` sobre una nota, o "Open alongside" en el menú contextual, abre una **segunda nota
  lado a lado** en el área del editor. Si la nota ya está en un panel, lo enfoca (no la duplica).
- **Dos secciones de la MISMA nota a la vez:** `Ctrl/Cmd+Click` sobre un **tag de sección** (sidebar)
  o "Open section alongside" en el menú contextual de la sección abre un **panel nuevo en esa
  sección**, aunque la nota ya esté abierta en otro panel. Si ya hay un panel exactamente en esa
  nota+sección, lo enfoca. Cada panel tiene sus pestañas y recuerda su propia sección; se editan a
  la vez sin pisarse (cada guardado solo toca la sección que edita ese panel).
- Con varios paneles de la misma nota, la cabecera del panel muestra **"Nota · Sección"**.
- Paneles reordenables (asa "Drag"), redimensionables por el borde y cerrables (✕). Borrar en un
  panel la sección que otro tiene abierta hace que ese otro caiga a la primera sección.
- Permite comparar o trabajar con dos notas a la vez sin abrir ventanas sticky.

## Abrir sección en otra ventana

- Menú contextual de una **sección** → "Open in New Window", o paleta de comandos → "Open section in
  new window" (actúa sobre la sección del panel activo). No está en el menú ⋯ del editor.
- **No disponible para notas cifradas** (se edita en la ventana principal). Si una ventana ya abierta
  muestra una nota que se cifra después, pasa a solo lectura (pide la contraseña para verla).
- Abre una ventana **solo-editor** (sin sidebar): barra de título propia con "Nota · Sección" y
  minimizar/maximizar/cerrar; normal (NO siempre encima), redimensionable. Muestra el editor completo
  de la nota (pestañas incluidas) abierto en esa sección; puedes cambiar de sección dentro.
- Se pueden abrir varias. Reabrir la sección que una ventana ya muestra la enfoca en vez de duplicarla.
- Cerrarla la destruye (no va al tray). Los cambios se sincronizan en vivo en ambos sentidos con la
  ventana principal (y con otras ventanas/stickies).
- Atajos dentro: `Ctrl+T/W` (sección nueva/borrar), `Ctrl+M` (raw), `Ctrl+F` (buscar), `Ctrl+S/G`
  (sticky), `Ctrl+Tab`. No tiene paleta ni `Ctrl+N`.

---

## Grupos y carpetas

Jerarquía de organización de un solo nivel de anidación: **grupo → carpeta → nota**.

### Grupos
- **Crear**: botón `+ New group` (nombre + color).
- **Renombrar / Eliminar / Color / View group / Archive**: menú contextual en la cabecera del grupo.
- **Colapsar / Expandir**: click en la cabecera (estado persiste entre sesiones).
- **Ver grupo (group overview)**: click en **el nombre** del grupo (hover sutil sobre el texto), o
  "View group" en el menú contextual. Click en el resto de la cabecera = colapsar/expandir.
- **Archivar grupo**: menú contextual → "Archive group". Oculta el grupo **y todas sus notas** de
  la lista (las notas conservan su propio estado `archived`). Se revela con el mismo toggle
  **"Show archived"** del footer: los grupos archivados aparecen atenuados y al final. Para
  recuperarlo: "Unarchive group" (en el menú contextual del grupo atenuado, o el botón "Archived"
  de la cabecera de la group overview).
- **Asignar nota**: drag & drop, o menú contextual → "Add to group".
- Cada grupo tiene un color que tiñe los dots/carpetas de sus notas: los **8 colores del tema** o
  cualquier **color libre** (swatch con degradado al final de la paleta → selector nativo del SO).
- Las notas sin grupo aparecen al final, en "Sin grupo".

### Carpetas (subcarpetas dentro de un grupo)
- **Crear**: desde el submenú "Move to folder" → "+ New folder…", o en la cabecera del grupo.
- **Mover nota a carpeta**: menú contextual de la nota → "Move to folder" (submenú con las
  carpetas del grupo). "Group root" la saca de la carpeta sin sacarla del grupo.
- **Renombrar / Eliminar**: menú contextual de la cabecera de carpeta. Al borrar una carpeta sus
  notas vuelven a la raíz del grupo.
- **Colapsar / Expandir**: independiente de los grupos (estado persistido).

> Grupos y carpetas se guardan en `groups.json` / `folders.json` dentro del dir de notas y **se
> sincronizan con GitHub** (no en `settings.json`).

---

## Vista de grupo (group overview)

Vista amplia que **sustituye el área del editor** para ver de un vistazo todo el contenido de un
grupo. El sidebar permanece visible como contexto. Pensada para ubicar notas y entender la
distribución de un grupo cuando hay muchas notas/carpetas.

**Cómo entrar:** click en el **nombre** del grupo en el sidebar (hover sutil sobre el texto), o
click derecho en la cabecera del grupo → **"View group"**.

**Cómo salir:** click en una nota (abre esa nota en el editor), `Esc`, o el botón `✕` de la
cabecera. Seleccionar cualquier nota —también desde el sidebar— cierra la vista.

**Disposición** (estética mono-minimalista, acento fino del color del grupo):
- Cabecera: punto de color (clicable → paleta) + nombre + contadores (`N notas · M carpetas`) +
  acciones.
- Una **banda por carpeta** (con su contador), una banda **"No folder"** para las notas sueltas
  del grupo, y una banda **"Archived"** al final con las notas archivadas del grupo.
- Dentro de cada banda, las notas en **cuadrícula responsiva** de tarjetas.

**Tarjeta de nota:** título + **secciones** (mismos tags de sección que el sidebar, clicables → te
llevan directamente a esa sección de la nota) + fecha de actualización (`dd/MM/yyyy · HH:mm`).
Acento del color del grupo a la izquierda.

**Acciones:**
- **Abrir nota** → click en la tarjeta (abre la primera sección); click en un tag de sección abre
  esa sección concreta.
- **Reorganizar** → arrastrar una tarjeta a otra banda mueve la nota de carpeta (la banda
  "Archived" no es zona de drop).
- **Crear** → botones "New note" / "New folder" en la cabecera.
- **Renombrar el grupo** → doble clic en el nombre de la cabecera (o el lápiz al hacer hover).
- **Cambiar el color del grupo** → click en el punto de color de la cabecera: abre un popover con la
  paleta (la misma del menú contextual del grupo en el sidebar) más el swatch de **color libre**; el
  color actual va marcado. Se cierra al elegir un preset, con click fuera o con `Esc` (que en ese caso
  no cierra la vista); al usar el color libre el popover se queda abierto mientras se arrastra.
- **Renombrar / eliminar una carpeta** → botones lápiz/papelera en la cabecera de su banda (aparecen
  al hover; borrar pide confirmación y devuelve sus notas a la raíz del grupo).
- **Ancho de tarjeta** → slider discreto en la cabecera (atenuado, se realza al hover); ensanchar
  las tarjetas revela más secciones a la vez. El valor se persiste en `localStorage`.
- Solo se listan notas **no archivadas** en las bandas de carpetas/"No folder"; las archivadas van
  a su banda propia.

**Selección múltiple (acciones por lotes):** marca varias notas a la vez para operar sobre todas.
- **Marcar** → cada tarjeta muestra una **checkbox** (esquina sup-der) al pasar el ratón; click en
  ella la selecciona/deselecciona. Con una selección activa, un **click normal en la tarjeta**
  alterna su marca (en vez de abrir la nota); **Ctrl/Cmd+click** alterna siempre (e inicia la
  selección). Las tarjetas seleccionadas se resaltan (anillo). Funciona en todas las bandas,
  incluida "Archived".
- **Seleccionar todo** → botón **"Select all" / "Deselect all"** en la cabecera (junto a "New note";
  solo si hay notas) y atajo **`Ctrl/Cmd+A`**: marca **todas** las notas de la vista (carpetas +
  "No folder" + "Archived"); si ya lo están, limpia la selección.
- **Seleccionar una banda** → checkbox en la cabecera de cada banda (carpeta, "No folder" o
  "Archived"), visible al pasar el ratón por la banda o siempre que haya una selección activa:
  marca/desmarca solo las notas de esa banda. Si solo hay algunas marcadas se muestra en estado
  intermedio (guion).
- **Barra de acciones** flotante (abajo, centrada, sticky al hacer scroll) cuando hay ≥1 marcada:
  contador "N selected" + **Favorite/Unfavorite**, **Archive/Unarchive** (ambos como toggle: si
  todas ya lo tienen, lo quitan; si no, lo ponen), **Move to group** (cualquier grupo o "No group"),
  **Move to folder** (carpetas del grupo actual o "Group root"), **Delete** (con confirmación; "N
  notes will be permanently deleted") y **✕** para limpiar la selección.
- `Esc` cierra el popover de color si está abierto; si no, limpia la selección si hay alguna; si no,
  cierra la group overview.

---

## Vista de nota (note overview)

Vista amplia que **sustituye el área del editor** para ver de un vistazo **todas las secciones de
una nota**, cada una como una **mini-representación del editor** al abrir esa sección. El sidebar
permanece visible como contexto. Pensada para saltar rápido a una sección concreta o repasar la
estructura de una nota con muchas secciones. Es una de las tres vistas full-area mutuamente
excluyentes (grupo / nota / cerebro): abrir una cierra las otras, y seleccionar cualquier nota
vuelve al editor.

**Cómo entrar:**
- Botón **⊞** (icono de cuadrícula) en la toolbar del editor, justo **al lado de la estrella de
  favoritos**.
- **Click derecho** sobre la nota en el sidebar → **"Note overview"**.

**Cómo salir:** `Esc`, el botón `✕` de la cabecera, o click en una tarjeta de sección (abre esa
sección en el editor).

**Disposición** (misma estética mono-minimalista que la group overview):
- Cabecera: candado si está cifrada + **título de la nota editable inline** (click o lápiz al hacer
  hover → input; commit en blur/Enter, `Esc` revierte; no editable si está bloqueada) + estrella de
  favorito (toggle) + contador (`N sections · fecha`) + botón **"Select all" / "Deselect all"** (solo
  si hay secciones) + botón **"Add section"** + botón **borrar nota** (papelera roja, con
  confirmación) + `✕`.
- Cuadrícula de **tarjetas de ancho fijo**, una por sección.

**Tarjeta de sección** — replica lo que verías al pinchar esa sección (de las pestañas hacia abajo):
- Etiqueta superior con el **nombre de la sección** y su color (identifica la tarjeta) + icono
  rich/raw.
- **Título de la nota + fecha de creación**.
- Una **barra-toolbar representativa** (oscura, sin iconos — solo evoca la toolbar del editor).
- **Unas pocas líneas** del contenido de la sección, renderizadas igual que en el editor pero
  diminutas (vía `zoom`) y recortadas con un fade inferior. Las secciones vacías muestran "Empty
  section".

**Acciones:**
- **Abrir sección** → click en la tarjeta (te lleva directo a esa sección en el editor).
- **Add section** → crea una sección nueva y **navega al editor en ella** para escribir.
- **Renombrar la nota** → click en el título de la cabecera (o el lápiz al hacer hover).
- **Borrar la nota** → botón de papelera en la cabecera (con confirmación).
- **Favorito** → toggle de la estrella en la cabecera.
- **Selección múltiple de secciones** (igual que en la group overview): un **checkbox** aparece en la
  esquina superior derecha de cada tarjeta al hacer hover; **click** en el checkbox lo marca,
  **Ctrl/Cmd-click** sobre la tarjeta togglea, **Shift-click** selecciona el rango. El botón
  **"Select all"** de la cabecera (y `Ctrl/Cmd+A`) marca todas las secciones; si ya lo están, pasa a
  **"Deselect all"** y limpia la selección. Con ≥1 marcada aparece una **barra de acciones flotante**
  anclada abajo: **Hide from AI / Show to AI** (oculta o vuelve a indexar las secciones para la IA;
  solo en notas no cifradas), **Raw mode / Editor mode** (cambia de golpe el modo de todas las
  seleccionadas — el mismo flag persistido que el menú `⋯` de la sección en el editor; si todas ya
  están en raw, el botón las devuelve al editor; nunca toca el contenido), **Delete** (borra las
  seleccionadas con confirmación — deshabilitado si están todas marcadas, para no dejar la nota
  vacía) y **Clear**. `Esc` limpia la selección antes de cerrar la vista.
- Notas **cifradas y bloqueadas** muestran un estado "encrypted" (sin previews) hasta desbloquear
  en el editor.

---

## Vista "All content" (índice global)

Vista a pantalla completa (sustituye el editor; el sidebar sigue visible) que muestra **todo el
contenido** del usuario de un vistazo, a modo de índice. Hermana de la vista de grupo y la de nota.

**Cómo entrar:** botón **"View all content"** (icono de cuadrícula) en la cabecera del sidebar, justo
debajo de "+ New note".

**Disposición** (misma estética que la vista de grupo: cabecera fija + área scroll + tarjetas en grid):
- **Favorites** — las notas marcadas como favoritas, como tarjetas de nota (mismas que la vista de grupo:
  título + tags de sección clicables + fecha).
- **Groups** — cada grupo como un **tile compacto** (barra de color + icono de carpeta tintado + nombre +
  nº de notas). Los tiles son **desplegables en acordeón**: click en un tile lo **expande inline** (chevron
  que gira) y abre, a lo ancho de la rejilla, un panel con sus notas sueltas y sus carpetas (cabecera de
  carpeta colapsable + notas dentro), igual que el sidebar. Para abrir la group overview completa del grupo
  está el botón **"Open group view"** (icono de maximizar) que aparece al pasar el ratón por el tile. La
  expansión es **local a esta vista y arranca colapsada** (no se recuerda entre sesiones). Pueden expandirse
  varios grupos a la vez.
- **Notes** — las notas sueltas (sin grupo), como tarjetas de nota.
- Si no hay nada, un **empty state** centrado.

**Búsqueda:** input en la cabecera (placeholder "Search...", local a esta vista — no afecta al filtro del
sidebar). Filtra favoritos y notas sueltas; un grupo se muestra si su nombre coincide o si contiene alguna
nota que coincida. Con una búsqueda activa, los grupos (y sus carpetas) se **despliegan automáticamente** y
solo muestran dentro las notas que coinciden, para revelar los resultados. Acepta el filtro `#sección` igual
que la búsqueda del sidebar.

**Filtro de fecha/calendario:** toolbar fija justo debajo de la cabecera (botones segmentados
`All/Today/Week/Month` + toggle de **calendario** desplegable con marcadores de actividad por día). Vive
**aquí** (antes estaba en el sidebar). Filtra por `updated` (o, con un día elegido, por creadas/modificadas
ese día) y se combina con la búsqueda; afecta a las tres bandas (Favorites, Groups y su contenido, Notes).
Ver "Filtros por fecha" más abajo.

**Volver (back inteligente):** si entras a un grupo o a una nota **desde** esta vista, el botón cerrar/`Esc`
de esa group/note overview te devuelve a "All content" (no al editor). Cerrar "All content" con la X o `Esc`
vuelve al editor. Seleccionar cualquier nota (aquí o en el sidebar) también vuelve al editor.

---

## Secciones dentro de una nota

Cada nota puede tener múltiples secciones independientes, como tabs:

```
[Note ×] [Tasks ×] [Questions ×] [+]                    [⊞] [⭐] [⋯]
```

(`⊞` = note overview · `⭐` = favorito · `⋯` = menú de sección: raw/editor, copiar,
**guardar como plantilla**, **exportar nota**, sticky, **ocultar a la IA**, hacer permanente, archivar,
cifrar, borrar nota)

- **Exportar nota** (`Export note…`, icono `Share`): abre el popup de exportación (el mismo de
  Ajustes / paleta, evento `noteflow:open-export`) con **esa nota ya preseleccionada** — con
  `detail: { noteId }` el popup preselecciona esa nota en vez de la activa, y la lista aunque esté
  archivada. También en el menú contextual de nota (right-click en el sidebar). Oculto si la nota está
  cifrada y bloqueada.

- **Agregar**: `Ctrl+T` o botón `+`.
- **Renombrar**: doble-click en el tab → Enter para guardar, Esc para cancelar. O desde la franja del
  click derecho (abajo), escribiendo directamente en el nombre.
- **Click derecho en un tab** → franja bajo la tira con el **nombre de la sección editable**, los
  colores de sección, `Auto`, y los botones **Duplicate section** (`CopyPlus`) y **Delete** (papelera,
  solo si hay >1 sección) y `×` para cerrar.
  - **Nombre editable** (`SectionNameField`): en reposo se ve como la etiqueta mono en mayúsculas; al
    pasar el ratón aparece un subrayado y al hacer click se edita con las mayúsculas/minúsculas reales.
    Se guarda (`updateSection`) con **Enter** (que además cierra la franja y devuelve el foco al editor)
    y al **perder el foco** (click en un color, en `×`, fuera, en otro tab…). Vacío o sin cambios → no
    guarda y restaura el nombre. **Esc** descarta el borrador y deja la franja abierta; un segundo Esc
    (o Esc sin cambios) la cierra. Mientras se escribe, los atajos de la app (`Ctrl+T/W/M/F/S/G`,
    `Ctrl+Tab`…) no se disparan. Con la nota cifrada y bloqueada el nombre es de solo lectura. Si se
    renombra y luego se elige color en el mismo gesto, el color va al nombre nuevo.
- **Duplicar**: `Duplicate section` (franja del click derecho o menú contextual de un tag de sección)
  crea una copia con id nuevo, mismo contenido, mismo modo raw/editor y mismo flag "oculta a la IA",
  llamada `"<nombre> (copy)"` / `"<nombre> (copia)"` según el idioma de la UI, **justo a la derecha** de
  la original, y la deja activa (`notesStore.duplicateSection`). No se ofrece con la nota cifrada y
  bloqueada.
- **Reordenar**: drag & drop los tabs. Si arrastras cerca del borde izquierdo o derecho de la tira,
  esta scrollea sola en esa dirección para poder soltar sobre tabs que están fuera de la vista. Al
  soltar, la tira se queda donde estabas (no salta de vuelta a la sección activa).
- **Eliminar**: `Ctrl+W` o botón `×` (no se puede si es la única sección).
- **Navegar**: `Ctrl+Tab` / `Ctrl+Shift+Tab` (siguiente / anterior).
- **La tira sigue a la sección activa**: con muchas secciones, si la que pasa a estar activa queda
  fuera de la vista, la tira se desplaza sola hasta mostrarla — venga el cambio de donde venga
  (click en el tab, `Ctrl+Tab`, click en un tag de sección del sidebar o de una vista, crear/borrar/
  deshacer una sección, o al volver a una nota en la sección que estabas).
- **Sticky**: botón `⧉` abre la sección en ventana flotante.
- **Color de sección**: desde el menú contextual de la nota (o la barra de color del editor) se puede
  asignar un color a una sección por su nombre: los 8 del tema o un **color libre** (swatch con
  degradado → selector nativo del SO); "Auto" vuelve al color por nombre. Se aplica a los tags de
  sección en el sidebar. Se guarda en `section-colors.json` (sincronizado).
- **Ocultar a la IA** (`Hide from AI`): marca una sección como invisible para la IA. Una sección
  oculta **nunca** se indexa ni aparece en el chat, en "Related notes", en el grafo del cerebro ni en
  las tools del agente — la IA actúa como si no existiera (el resto de la app la trata con normalidad).
  Disponible en el **menú `⋯` del editor** (sección activa) y en el **click derecho sobre un tag de
  sección** (sidebar, vista de grupo y tarjetas de la vista de nota). Las secciones ocultas muestran
  un icono `EyeOff` (pestaña del editor, tags del sidebar, badge en la vista de nota); `Show to AI` lo
  revierte (re-indexa la sección). Útil para datos sensibles o ruido que no quieres que el modelo use.

Las secciones aparecen como pequeños tags en la tarjeta de la nota y son clickeables para
navegar directamente a esa sección.

> **Dos menús contextuales (mismo componente `NoteContextMenu`, distinto contenido según el
> objetivo):** el click derecho **sobre la nota** (en zona sin sección) muestra las acciones de
> nivel-nota (favorito, archivar, abrir en paralelo, duplicar, mover a grupo/carpeta, etc.); el click
> derecho **sobre un tag de sección** muestra solo lo propio de la sección (abrir la sección en
> paralelo, color de sección, ocultar a la IA, abrir como sticky, abrir en ventana nueva) más unas
> pocas comunes (note overview, borrar nota). El componente
> distingue por el campo `sectionId` del request (`null` = nota).

---

## Previsualización de sección al hover

Cualquier elemento que **navega a una sección concreta** muestra, al pasar el ratón, una
**tarjeta flotante con una previsualización** de esa sección — la misma mini-representación del
editor que usa la [vista de nota](#vista-de-nota-note-overview) (etiqueta de sección + título +
fecha + unas líneas del contenido renderizado, recortadas con fade). Permite ojear el contenido
sin navegar.

**Dónde aparece:**
- **Sidebar** → tags de sección de cada nota.
- **Vista de grupo** → tags de sección en las tarjetas.
- **Editor** → pestañas de sección (excepto la sección activa, que ya estás viendo).
- **Paneles de IA** (Related / Chat) → resultados que apuntan a una sección.

**Comportamiento:**
- Aparece tras un breve retardo (~380 ms) para no parpadear al barrer varias pestañas.
- **Posición:** en sidebar/grupos/editor cuelga con su esquina superior izquierda **junto al
  cursor** (hacia abajo-derecha), para no tapar el contenido a la derecha del ratón; en los
  paneles de IA sale al lado del elemento. Se voltea/recoloca si no cabe en pantalla.
- Se cierra al **quitar el ratón** o con **cualquier click**.
- Secciones **vacías** muestran "Empty section"; secciones de notas **cifradas y bloqueadas** no
  se previsualizan (no hay contenido en memoria).

> En la **vista cerebro** la interacción es distinta (click en vez de hover): ver esa sección.

---

## Editor de contenido

### Dos modos de edición (por sección)

**WYSIWYG** (visual, por defecto) — edición tipo Word/Notion con toolbar.
**Raw Markdown** (texto puro) — textarea plana con markdown.

- Alternar con `Ctrl+M` (o el icono Eye/Edit en la toolbar).
- Undo/Redo con `Ctrl+Z` / `Ctrl+Y`.

### Formatos soportados
| Elemento | Markdown | Atajo |
|---|---|---|
| Negrita | `**texto**` | Ctrl+B |
| Cursiva | `*texto*` | Ctrl+I |
| Subrayado | — | Ctrl+U |
| Tachado | `~~texto~~` | — |
| Resaltado | `==texto==` | Toolbar |
| Código inline | `` `code` `` | Ctrl+E |
| Bloque de código | ` ```lang ` | Ctrl+Shift+B |
| Heading H1–H3 | `#`, `##`, `###` | Toolbar |
| Lista viñetas | `- item` | Toolbar |
| Lista numerada | `1. item` | Toolbar |
| Lista de tareas | `- [ ] tarea` | Toolbar |
| Cita / Blockquote | `> texto` | Toolbar |
| Tabla | — | Toolbar (menú contextual para filas/columnas) |
| Link | `[texto](url)` | Toolbar |
| Imagen | `![alt](src)` | Drag & drop / Paste |
| Separador | `---` | — |

### Tareas con deadline, alarma e importancia
Los items de lista de tareas (`- [ ]`) tienen soporte extendido:
- **Deadline**: fecha límite (se muestra junto al checkbox).
- **Alarm**: notificación nativa del sistema en ese momento (el proceso principal la dispara,
  funciona aunque la ventana esté oculta; incluye las ya vencidas al registrar).
- **Importancia/prioridad**: grado Low / Medium / High. Se elige en un picker y queda visible
  como un **punto de color** sin texto (Low → verde, Medium → amarillo, High → rojo), para que
  ocupe poco. Persiste en markdown con el marcador ` 🔺{level}` (low|medium|high), tras `📅`/`⏰`.
- Al hacer hover sobre el task item aparecen **dos triggers** a la derecha del texto: un icono de
  **calendario** para el deadline/alarma y un icono de **bandera** para la importancia. Cada uno
  abre su propio picker; los valores asignados quedan visibles de forma permanente.

### Tablas
- Insertables desde la toolbar (3×3 con cabecera por defecto).
- Toolbar contextual y menú de clic derecho para añadir/eliminar filas y columnas,
  y alinear la columna (izquierda/centro/derecha — persiste vía `:---:` en markdown).
- El clic derecho mueve el cursor a la celda pulsada, así las acciones actúan donde clicas.
- **Cabecera obligatoria:** no se puede borrar la fila de cabecera ni insertar una fila
  por encima de ella (las pipe-tables de markdown exigen cabecera). Las celdas de cabecera
  vacías muestran el placeholder "Column".
- **Sin redimensionado de columnas:** las tablas ocupan el ancho disponible con columnas
  equitativas. El ancho de columna NO se puede guardar en markdown portable, así que no se
  ofrece resize (evita el affordance que se reseteaba al recargar la nota).
- **Pegar markdown con tabla:** en el editor visual (WYSIWYG), pegar texto que contenga una
  tabla markdown (`| a | b |` + fila separadora `|---|---|`) la convierte en tabla real
  (antes se pegaba como texto literal). El modo Raw Markdown muestra siempre el fuente tal
  cual — para verla renderizada hay que cambiar al modo visual.

### Imágenes
- Drag & drop o paste desde el portapapeles.
- Redimensionables arrastrando los bordes.
- Se guardan como base64 inline en el `.md`.

### Bloques de código
- Botón de copiar integrado en cada bloque (arriba a la derecha, visible al pasar el ratón).
- **Selector de lenguaje** (arriba a la izquierda): muestra el lenguaje actual ("Plain text" si no
  hay ninguno). Al pulsarlo abre un desplegable con un buscador y la lista de lenguajes soportados;
  la primera opción, **"Plain text"**, desactiva el resaltado. Si el bloque tiene lenguaje asignado, la
  etiqueta se ve siempre (sutil) para saber el lenguaje sin hover. Se cierra al hacer click fuera o
  con Escape.
- Syntax highlighting con Lowlight.

### Relacionar secciones (slash command `/`)
- Mientras escribes en el editor **rich**, teclea `/` → aparece un **menú de comandos** con
  **"Link section"**. Al elegirlo se abre un **buscador** de todas las secciones (de cualquier nota
  o grupo); filtra por nombre de sección o título de nota. Al elegir una, se inserta una **pill**
  (chip con icono de enlace + nombre de la sección) en el punto donde estabas escribiendo.
- **Click** en la pill → navega a la sección destino (misma nota u otra). **Hover** → muestra el
  mismo preview del contenido que en el resto de la app. La pill muestra el nombre **en vivo** (si
  renombras la sección destino, se actualiza); si la sección destino se borra, la pill queda en
  estado **"roto"** (atenuada, tachada, sin navegar).
- Estas relaciones también aparecen como **aristas en la Vista Cerebro**, conectando las dos
  secciones — y **funcionan aunque la IA/embeddings esté desactivada** (no dependen del modelo).
- La relación se guarda **dentro del texto** de la sección (es un enlace markdown), así que
  sincroniza, sobrevive export/import y en **modo raw** se ve como `[Nombre](noteflow://…)`. El
  slash command solo está en modo rich; el buscador excluye notas cifradas/archivadas/temporales.

### Búsqueda dentro de la nota
- `Ctrl+F` (con el editor enfocado) → barra de "Find in note" que resalta coincidencias.
- Funciona en ambos modos (WYSIWYG y raw).

### Tamaño de fuente
- `Ctrl++` aumentar · `Ctrl+-` disminuir · `Ctrl+0` reset.
- También desde Settings → Editor (fuente y tamaño).

### Ancho del contenido (Full / Readable)
- Settings → Editor → **Width**: alterna entre `Full` (por defecto, el contenido ocupa todo el
  ancho del área del editor) y `Readable` (columna de lectura centrada de ~72 caracteres, estilo
  Obsidian/iA Writer).
- En modo `Readable` se centran los bloques de texto (párrafos, headings, listas, citas,
  separadores) **y los bloques de código**; solo **tablas e imágenes rompen la columna** y siguen
  a ancho completo. El ancho de columna se deriva del tamaño de fuente base del cuerpo (no del de
  cada elemento), así los headings comparten la misma columna. Aplica a ambos modos (WYSIWYG y
  raw); no afecta a los stickies.
- En `Readable`, las acciones de cada tarea (importancia + deadline/badge) se sacan al margen
  derecho, fuera de la columna, cuando el editor mide ≥ 58em (container query en `src/index.css`).
  Si el bloque no cabe en el margen (badge con fecha + alarma), se desplaza hacia la izquierda
  solapando el final de la columna en vez de provocar scroll horizontal; el contenedor de scroll
  del editor es además `overflow-x: hidden` (tablas y código tienen su propio scroll interno).
- Preferencia local persistida en `localStorage` (`noteflow-readable-width`), en
  `editorSettingsStore` junto a fuente/tamaño. No se sincroniza.

---

## Local AI — "Related notes" (Fase 1 de "El Cerebro")

Primera pieza del plan "El Cerebro" (segundo cerebro consultable). Un **índice semántico local**
indexa cada **sección** de cada nota como un embedding y muestra, para la **sección activa**, las
secciones más afines de otras notas (y hermanas de la misma nota) en un panel **"Related notes"**
al pie del editor. **100% local y offline** — nada sale de la máquina; el índice es un artefacto
derivado reconstruible desde los `.md`.

- **Activación:** flag `settings.ai.enabled` (default **off**). La **UI definitiva de activación
  está en la vista cerebro** (ver abajo): con la IA off el cerebro muestra solo la estructura y un
  CTA "Activar IA local"; al activar descarga un modelo pequeño (~una vez) e indexa con barra de
  progreso. También hay un toggle **"Local AI"** en Settings → AI.
- **Panel Related:** al cambiar de sección/nota, el panel actualiza las relacionadas; click en un
  resultado navega a esa sección. Las notas **cifradas se omiten** (no entran al índice).
- **Reindexar:** botón "Reindex all notes" en Settings → AI (muestra progreso); el índice también
  se mantiene al día solo al guardar (incremental, debounce).
- Roadmap: este índice alimenta la **vista cerebro** (Fase 2 ✅) y el **chat RAG** (Fase 3 ✅, ver
  "Panel de IA" más abajo). Un índice, tres consumidores. Detalle técnico en `.claude/context/ai.md`.

---

## La Vista Cerebro (Fase 2 de "El Cerebro")

Modo visual conmutable: el **botón "Cerebro"** (icono de cerebro) en el TitleBar abre la vista. Desde
la Fase 3 la ventana se **parte en dos mitades redimensionables**: a la izquierda el **panel de IA**
(sustituye al sidebar, que se oculta) y a la derecha el **grafo** del cerebro; el divisor central se
arrastra y su posición se recuerda. Volver = botón Cerebro otra vez, tecla de cierre, o click en
cualquier nota. Es **aditivo** — la lista de siempre sigue siendo el modo principal.

- **Nodos:** grupos, carpetas y notas. Cada grupo es una región con **su color**; carpetas y notas
  heredan el color de su grupo (las notas sueltas son neutras). No aparecen notas archivadas,
  cifradas ni temporales.
- **Dos capas de conexiones:**
  - **Estructura** (líneas sólidas): la jerarquía `grupo → carpeta → nota` que tú creas.
  - **Contenido** (líneas tenues): notas que **hablan de lo mismo** según la IA, aunque estén en
    grupos distintos. Salen del índice semántico (necesita la IA activada).
- **Interacción:** navegación libre estilo Obsidian — arrastrar el lienzo (pan), **rueda para zoom**,
  arrastrar un nodo para recolocarlo. **Hover/seleccionar** una nota **resalta sus conexiones de
  contenido** y atenúa el resto. **Click en un nodo de nota/sección** ancla junto a él una
  **ventanita de previsualización clicable** (misma tarjeta que el resto de la app); al **pulsar
  dentro de la ventanita** se navega a esa sección en el editor. Se cierra con click fuera o `Esc`.
  Click en un grupo abre su group overview. Los nombres de las notas aparecen al acercar el zoom.
- **Toggle "Contenido":** botón en la barra superior para mostrar/ocultar la capa de contenido y
  dejar solo la estructura.
- **Sin IA:** el cerebro funciona igualmente mostrando solo la estructura + el CTA de activación.
- **Iluminación por chat:** cuando el chat responde, las notas que usó **se encienden** en el grafo
  (halo brillante que parpadea en 3D / glow en 2D) — no se llenan de etiquetas, solo brillan.

---

## Panel de IA — chat + segundo cerebro (Fase 3 de "El Cerebro")

La mitad izquierda de la vista cerebro. Su UI sigue el idioma de la app (EN/ES). Pestañas:

- **Chat:** conversación con un LLM que responde **usando tus notas como contexto** (RAG). Streaming
  token a token, botón de **parar**, y **citas** clicables debajo de la respuesta (abren la nota en su
  sección) que además **iluminan** esas notas en el cerebro. Arriba: **historial** de chats (crear,
  abrir, borrar — se guardan localmente), botón **nuevo chat**, y un **selector de modelo** para elegir
  con qué modelo se hace la siguiente pregunta. Si no hay proveedor configurado, muestra un CTA a Ajustes.
  - **¿Ha terminado?** Mientras la IA trabaja siempre hay una señal al pie del chat: **"Thinking…"**
    cuando piensa sin escribir (al empezar, entre acciones o si se queda >~1 s callada a mitad de
    respuesta), **tres puntitos pulsando** mientras escribe, o la propia fila de la acción en curso /
    la tarjeta de confirmación. Cuando no queda ninguna señal, la respuesta ha terminado.
  - **Adjuntar archivos (📎):** junto al campo de escribir hay un botón de clip para mandar **imágenes,
    PDFs y .txt/.md** con tu pregunta — lo que el **modelo activo** admita (Anthropic: PDF+imágenes+texto;
    OpenAI-compatibles: imágenes+texto; .txt/.md siempre). Ojo: en **NoteFlow AI** varios modelos curados
    son de solo texto —incluido el que viene elegido por defecto—, así que ahí el botón solo ofrece
    imágenes si eliges un modelo con visión. Los archivos elegidos aparecen como **chips
    removibles** sobre el campo y quedan pegados al mensaje al enviarlo; puedes mandar solo adjuntos sin
    texto. La IA **lee los documentos directamente** (la app no extrae texto): el .txt/.md se incrusta en
    el mensaje y el PDF/imagen va nativo al proveedor. Los adjuntos siguen disponibles para **preguntas de
    seguimiento** en la misma conversación. (Privacidad: los bytes nunca salen del proceso principal.)
  - **Modo agente (acciones):** además de responder, el chat puede **actuar sobre la app**: crear,
    editar, organizar (mover a grupo/carpeta, renombrar, fijar/archivar) y borrar notas, secciones,
    grupos y carpetas. No hay interruptor — **las acciones están siempre disponibles** y el modelo
    decide actuar solo cuando se lo pides; si solo preguntas, solo responde. Cada acción se muestra
    **inline** en la respuesta (⟳ en curso → ✓ hecho / ✗ error) con un resumen ("Created note…",
    "Moved to group…"), y los cambios aparecen al instante en el sidebar/editor sin recargar. Las
    **acciones destructivas** (borrar nota/sección/grupo/carpeta) **piden confirmación**: aparece una
    tarjeta **Confirm / Cancel** y nada se borra hasta que confirmas. Las notas **cifradas** se pueden
    listar pero el agente no lee ni edita su contenido. (Implementación: tool-calling nativo, no el CLI.)
  - **Si algo falla a media respuesta** (p. ej. se agota la cuota mensual del plan NoteFlow AI
    mientras el modelo escribe o encadena acciones), **el texto ya escrito se conserva** y el error
    aparece justo debajo en una **fila roja** ⚠ con el motivo. Nunca se corta la respuesta en seco
    sin explicación.
- **Related:** las "Related notes" por sección (lo que antes estaba al pie del cerebro), eligiendo
  cualquier nota/sección como origen. Necesita la IA local (embeddings) activada.
- **Profile:** cuestionario del **segundo cerebro** — **no aparece solo**: al entrar al cerebro
  siempre aterrizas en el chat (o en el proveedor, si aún no configuraste ninguno) y el cuestionario
  se abre cuando pulsas la pestaña **Profile** (o desde la paleta / Ajustes → IA). Pensado para
  **cualquier persona** (no solo
  perfiles técnicos) y para **mínimo esfuerzo**, organizado en **secciones**: *Professional* (a qué
  te dedicas, herramientas, en qué te enfocas), *Personal*, *Your style* y *Working with the AI*
  (**cómo quieres que te hable la IA** — el chip que más ajusta sus respuestas). **Filosofía:
  preguntar de forma indirecta en vez de pedirte que te auto-analices** (escribir tu personalidad
  cansa y sesga). Así, la mayor parte de la señal sale de **favoritos de baja fricción** (canciones/
  artistas, películas/series, libros, un viaje soñado) y de **binarias tipo "esto o lo otro"**
  (¿fin de semana planeado o improvisado?, ¿recargas a solas o con gente?…) diseñadas sobre el
  **Big Five**: la IA deduce rasgos a partir de lo que esas preferencias *representan*, como
  **pistas probabilísticas** (no verdades absolutas). Se mantienen también unos chips directos de
  auto-descripción (enfoque híbrido). Además puedes **adjuntar archivos** (un CV en PDF, imágenes,
  .txt/.md — lo que el proveedor activo sepa leer de forma nativa; Anthropic admite PDF e imágenes,
  los OpenAI-compatibles solo imágenes) y **pegar enlaces** (LinkedIn, portfolio, GitHub, web…),
  cuyo contenido la app descarga y resume. Al pulsar **Generate profile**, la IA no solo reformatea:
  **infiere, abstrae y organiza** todo (respuestas + documentos + enlaces) en una nota de perfil en
  markdown, en tu idioma, editable como cualquier nota. **Discreción:** el perfil describe quién
  eres en **rasgos abstractos**, no por los títulos exactos que diste; los favoritos literales
  quedan en una sección final de baja relevancia y la IA tiene **prohibido sacarlos a colación** en
  conversaciones que no vienen a cuento (te recomienda directo, sin "como te gusta tal película…").
  La app nunca procesa los documentos: se los pasa directamente al modelo.
- **⚙ Settings (proveedor):** el asistente se alimenta de **una de dos fuentes, excluyentes**, y se
  eligen con un **selector de dos cards** (mismo patrón que Ajustes → Sincronización; badge
  Activo/Inactivo en cada una, y debajo solo la sección de la que elijas):
  - **NoteFlow AI (suscripción):** plan gestionado — sin API key ni Base URL (usa tu cuenta NoteFlow),
    modelos curados (los más caros con sufijo "N× cuota" — hoy 2× y 6×; el campo "Model" es de **solo
    lectura**, se elige haciendo clic en uno de los modelos) y **barra de consumo mensual**. Botón "Use NoteFlow
    AI" para activarlo (o check "Active" si ya lo es). Sin sesión o sin suscripción, la card sigue
    visible pero en vez del botón muestra el aviso del motivo ("sign in" / "requires subscription")
    **+ el bloque de planes con precios**: NoteFlow AI y, si tampoco tienes Cloud, el Bundle (con
    badge "Best value"). **La card entera es clickable**: con sesión y checkout configurado abre la
    pasarela de pago de ESE plan (antes había un botón "Subscribe" dentro; ahora la card muestra un CTA
    "Subscribe"); sin sesión, clicar la card lleva a Ajustes → Cuenta (CTA "Go to Account" con flecha);
    con sesión pero sin checkout en el build muestra "coming soon" y queda inerte. Esto vale tanto en
    Ajustes → IA como en el **panel de IA del Cerebro** (antes solo en Ajustes). Lo mismo si la
    suscripción caduca teniéndolo activo, para que entiendas el fallo y puedas cambiar de fuente.
    **Al suscribirte** (Subscribe → pagar → Refresh en Settings → Account), NoteFlow AI **se activa
    como proveedor automáticamente**.
  - **Tu proveedor / IA local (BYO; gratis y privado):** elige proveedor (Anthropic/Claude, OpenAI,
    DeepSeek, MiniMax, Moonshot, OpenRouter, Ollama local, o Custom OpenAI-compatible), pega tu **API
    key**, ajusta Base URL y modelo, y prueba la conexión. **Cada proveedor recuerda su propia
    key/modelo** — cambiar de proveedor no las mezcla. Las claves se guardan cifradas y nunca salen de
    tu máquina. Si el activo es NoteFlow AI, esta sección solo muestra el desplegable + un botón
    **"Use this provider"**: los campos (key, Base URL, modelo) aparecen al activarlo, porque siempre
    editan la config del **proveedor activo**.

> **Dos interruptores independientes:** la **IA local** (embeddings, se activa en el cerebro) da
> contexto RAG y conexiones de contenido; el **proveedor LLM** (Ajustes) da el chat. El chat funciona
> sin la IA local, pero entonces responde **sin contexto de tus notas**.

---

## Búsqueda y filtros

### Búsqueda global (sidebar)
- `Ctrl+Shift+F` → enfoca el input de búsqueda del sidebar.
- Busca en tiempo real en: títulos, contenido y tags.
- Case-insensitive, sin acentos.

> Nota: `Ctrl+F` está reservado para "Find in note" (búsqueda dentro del editor).

### Command palette
- `Ctrl+P` → abre la paleta de comandos: buscar notas y ejecutar acciones rápidas (nueva nota,
  abrir carpeta de notas, etc.). Navegación con ↑↓, Enter para seleccionar, Esc para cerrar.
- **Comandos de IA / Cerebro:** la paleta incluye accesos directos a la vista cerebro y al panel
  de IA: **Open Brain** (grafo 3D), **Chat with AI** (abre el cerebro en la pestaña Chat),
  **Find related notes** (pestaña Related), **AI profile** (segundo cerebro) y **AI provider
  settings** (configurar modelo/clave). Todos abren la brain view y enrutan el `AiPanel` a la
  pestaña pedida.
- **Ask AI a question…** es un sub-modo inline (como "Create group"): escribes la pregunta en la
  propia paleta y Enter abre el cerebro + chat y la envía directamente (en un chat nuevo). Si no
  hay proveedor LLM configurado, la pregunta queda en cola y se envía en cuanto configuras uno.

### Filtros por fecha (en la vista "All content")
```
[All] [Today] [Week] [Month]   +   [📅 calendario]
```
- **Ubicación:** este filtro vive en la **vista "All content"** (toolbar fija bajo la cabecera), no
  en el sidebar. El sidebar ya **no** tiene filtro de fecha (solo búsqueda, tags y archived).
- Botones rápidos por fecha de modificación (`updated`).
- El icono de calendario despliega un mes navegable para filtrar por un **día concreto** (marca
  los días con actividad: punto verde = creadas, punto neutro = modificadas; elegir día filtra notas
  creadas o modificadas ese día). Estado `filterDate` en el store + estado local del día/mes/expandido.
- Se **combina** con la búsqueda local de la vista y afecta a Favorites, Groups (y su contenido) y Notes.

### Filtros por tags
- Click en un tag del sidebar → filtra notas con ese tag. Click de nuevo → limpia.

### Notas archivadas
- Ocultas por defecto. Toggle `Show archived` en el footer. El mismo toggle revela también los
  **grupos archivados** (atenuados, al final de la lista).

### Orden de la lista
- **Sección favorites** (top del sidebar): notas marcadas como favoritas, en orden manual (drag-to-reorder).
- **Resto**: por última modificación (más reciente arriba), o en el orden manual si se ha arrastrado alguna nota.
- Las notas favoritas **también aparecen en su grupo/carpeta** normal (no se ocultan de ahí).

---

## Temas visuales

14 temas, accesibles desde **Settings → Appearance** (⚙ del TitleBar). Default: **NoteFlow Dark**.

| Modo | Temas |
|---|---|
| Dark (11) | NoteFlow Dark, Tokyo Night, Midnight Blue, Carbon, VS Code Dark, Dracula, True Godot, GruvBox Dark, Obsidian, Emerald Forest, Synthwave |
| Light (3) | NoteFlow Light, Arctic Day, Parchment |

Persisten entre sesiones y definidos en `src/lib/themes.ts` como sets de CSS vars.

**Personalización sobre el tema** (misma pantalla, todo con presets + selector de color libre y
reset por control): **fuente** de la app, **color de acento** y **colores del editor** — H1, H2, H3,
**cursiva**, **código inline** y un color compartido para el **borde izquierdo de bloques de código y
citas**. Cada control sin tocar sigue al tema (y cambia con él); el panel muestra un **preview en
vivo** de todo.

**Sync entre dispositivos:** el tema y toda esta personalización (más los ajustes del editor:
tamaño/familia de fuente y ancho legible) viajan en `ui-settings.json` dentro del dir de notas,
así que con cualquier sync activo (GitHub o Cloud) la apariencia sigue al usuario a cada máquina
y se aplica en caliente al recibir un pull. La **escala de UI** y el **idioma** quedan fuera
a propósito (por dispositivo).

---

## Tags

- Se definen con `#nombre` en el contenido de cualquier sección.
- Colores asignados automáticamente por nombre (8 colores consistentes).
- Aparecen en: sidebar (sección Tags), tarjeta de nota, header del editor.
- Click en un tag del sidebar → filtra todas las notas con ese tag.

---

## Encriptación de notas

- **Encrypt note** → menú `⋯` del editor → modal con contraseña.

Desde el menú contextual (right-click en nota), solo si la nota ya está cifrada:
- **Unlock note** → pide contraseña para acceder (desbloqueo solo durante la sesión).
- **Lock note** → vuelve a bloquear una nota desbloqueada.
- **Remove encryption** → elimina el cifrado permanentemente.

Las notas bloqueadas no muestran contenido hasta desbloquear.
Algoritmo: **AES-256-GCM + PBKDF2** (310.000 iteraciones, SHA-256). Sin master key ni backdoor.
El CLI ignora las notas cifradas.

---

## Menú contextual (right-click en nota del sidebar)

Click sobre la **nota**:
```
  ⭐ Add to favorites / Remove from favorites
  📦 Archive / Unarchive
  🔒 Unlock / Lock / Remove encryption   (solo si está cifrada)
  ▥ Open alongside        ← abre en paralelo (split)
  📋 Duplicate note
  ⇪ Export note…          ← popup de exportación con esta nota preseleccionada
  ⊞ Note overview         ← abre la vista de nota (todas sus secciones)
  ─────────────
  📁 Move to folder ▸  /  Remove from group     (si está en un grupo)
  📁 Add to group ▸                              (si no tiene grupo)
  ─────────────
  ⧉ Open as Sticky Note
  ─────────────
  🗑 Delete note   ← rojo
```

Click sobre un **tag de sección** (sidebar, vista de grupo, tarjetas de la vista de nota): se ocultan
las acciones de nota (favorito, archivar, split, duplicar/exportar nota, grupo/carpeta) y aparecen
las de sección:
```
  🔒 Unlock / Lock / Remove encryption   (solo si está cifrada)
  ⊞ Note overview
  ─────────────
  ▥ Open section alongside                ← panel nuevo en esa sección (aunque la nota ya esté abierta)
  👁 Hide from AI / Show to AI            (no en notas cifradas)
  ⧉ Duplicate section                     ← copia a la derecha y navega a ella
  🎨 Section color
  ─────────────
  ⧉ Open as Sticky Note                   ← abre esa sección
  ⧉ Open in New Window                    ← ventana solo-editor en esa sección (no en notas cifradas)
  ─────────────
  🗑 Delete section  (o Delete note si es la única sección)   ← rojo
```

---

## Ventana sticky (nota flotante)

Botón `⧉` en la toolbar del editor (o `Ctrl+S` para la sección actual, `Ctrl+G` para todas):
- Siempre encima (`alwaysOnTop`). Tamaño 300×300px, redimensionable (mín. 200×200).
- Frameless con barra de título propia y esquinas redondeadas.
- Modo WYSIWYG o Raw, igual que el editor principal.
- Cambios sincronizados con la ventana principal en tiempo real.
- Se pueden abrir varias a la vez.
- **Plegar/desplegar** (fold/unfold) desde su barra de título: se contrae a una píldora animada
  en la esquina de la pantalla (las píldoras se apilan).

---

## System tray

La app vive en el system tray. Al cerrar con `×` se oculta (no termina).

**Click en icono** → muestra/oculta la ventana.
**Right-click** → menú:
```
  Open NoteFlow
  New Note
  ─────────────
  Open notes folder
  ─────────────
  Quit
```

**Atajo global del sistema** (funciona aunque la ventana esté oculta):
- `Ctrl+Shift+Space` → muestra/oculta NoteFlow.

---

## Plantillas de nota (Note Templates)

Notas reutilizables con título + secciones predefinidas. Se guardan en `templates.json` (en el dir
de notas, **se sincroniza** con GitHub como el resto de metadatos).

- **Crear una plantilla:** menú `⋯` del editor → **Save as template**. Captura el título y las
  secciones de la nota actual; un pequeño modal pide el nombre (default = título de la nota o
  `Untitled template`). Oculto si la nota está **cifrada y bloqueada** (sin sesión desbloqueada).
- **Usar una plantilla:** Settings → **Templates** lista las plantillas guardadas. Cada una tiene
  **New note** (crea una nota a partir de la plantilla — regenera ids de sección frescos, navega a la
  nota y cierra Ajustes), **rename** (botón ✎ o doble-click sobre el nombre) y **delete** (con
  confirmación). Si la plantilla no tiene secciones, la nota nace con una sección `Notes` vacía.
- Estado vacío: mensaje invitando a usar el menú `⋯` → Save as template.

---

## Startup settings

Settings → Startup:
- **Launch on system startup**: NoteFlow arranca al iniciar sesión (oculto en el tray).
- **Open as sticky at startup**: selecciona qué secciones se abren como sticky al arrancar (solo
  si el autostart está activo; las notas cifradas no aparecen).

---

## Auto-actualización (in-app)

- Al detectar una versión nueva en GitHub, aparece el icono ⬇ en el TitleBar (y un aviso en
  Settings).
- Al pulsarlo, NoteFlow descarga el instalador (el botón muestra el % y, al terminar, un spinner
  "Installing…") y se actualiza **sin popups del SO ni cerrar/reabrir a mano**:
  - Windows: muestra la **barra de progreso nativa del instalador**, se cierra sola y se reabre ya
    actualizada — **sin el popup "cierra la aplicación" ni UAC** (instalador NSIS lanzado con
    `--updated`, que omite ese prompt; ver detalle técnico en `.claude/context/release.md`).
  - Linux (deb/pacman): pide la contraseña de root (diálogo del sistema — inevitable al instalar a
    nivel de sistema) y se relanza.
  - Linux (AppImage): se reemplaza a sí misma en su ubicación y se relanza.
- En Windows, la instalación queda cubierta por la barra de progreso nativa de NSIS. En Linux el
  feedback durante la instalación es el propio diálogo de root (deb/pacman) o es casi instantáneo
  (AppImage). Dentro de la app, el botón del TitleBar muestra `%` de descarga → spinner
  "Installing…" hasta que la ventana se cierra.
- Descargas restringidas a hosts oficiales de GitHub (allowlist de seguridad).

---

## Settings → Sync: elegir backend

La página **Sync** empieza con un **selector de dos tarjetas** — **NoteFlow Cloud** y **GitHub
Sync** — porque son **mutuamente excluyentes**: solo un backend puede estar activo a la vez. Cada
tarjeta lleva un **badge de estado** (Active / Paused / Inactive / Not connected) y, al pulsarla,
debajo se muestra **solo el panel de ese backend**. Al abrir la página viene preseleccionado el
backend que esté realmente en uso (Cloud activado → Cloud; si no, GitHub conectado → GitHub; si
ninguno → Cloud); a partir de ahí manda la elección del usuario. Con Cloud activado, GitHub queda
**en pausa** (badge amarillo + aviso ámbar en su panel; la config de GitHub se conserva).

## NoteFlow Cloud (Settings → Sync)

Nube de notas **cifrada** de pago (suscripción) con **dos modos de cifrado a elegir** (modelo
Obsidian Sync).

Los dos modos (se eligen al configurar, con dos cards):
- **Standard (managed, DEFAULT y recomendado):** el usuario no guarda NINGÚN secreto — la clave
  la custodia NoteFlow en el servidor y el desbloqueo es automático con la sesión iniciada
  (nunca se le pide nada). Copy honesto en la card: las notas van cifradas en tránsito y en
  reposo, pero NoteFlow técnicamente podría acceder a ellas.
- **Private (E2EE estricto, opt-in):** passphrase + recovery code; ni NoteFlow puede leer las
  notas. Perderlos ambos = notas irrecuperables (aviso explícito).

Flujo del panel según estado:
- **Sin sesión:** mensaje "inicia sesión en Settings → Account".
- **Sin claves (`no-keys`):** con la entitlement `cloud`, elección de modo con dos cards (Standard
  preseleccionada); sin ella, en su lugar sale el bloque de planes (ver "Gating por suscripción").
  Standard = un click ("Enable") y directo a desbloqueado. Private = crear **passphrase**
  (input + confirmación, mínimo 8 caracteres) → se muestra el **recovery code UNA sola vez** en
  un bloque ámbar destacado (copiable, con aviso rojo: perder passphrase + recovery = notas
  irrecuperables, NoteFlow no puede resetearlas) → botón "I have saved my recovery code" para
  continuar. El código no vuelve a mostrarse jamás.
- **Bloqueado (`locked`):** en modo managed el panel se desbloquea solo (spinner "unlocking…",
  reintento silencioso cada 10 s — típico de un arranque offline); en modo private, un único
  input acepta **passphrase o recovery code** → "Unlock".
- **Desbloqueado:** badge del modo activo (Standard / Private E2EE), badge Sync enabled/disabled,
  "Last sync", botones **Enable/Disable sync**, **Sync now** (pull manual con resultado tipo
  GitHub) y **Lock** (solo en modo private — en managed se re-desbloquearía solo). En managed,
  botón **"Switch to private mode"**: upgrade a E2EE (pide passphrase, muestra el
  recovery code una vez y borra la copia del servidor), con aviso de que las notas ya
  sincronizadas pudieron ser técnicamente accesibles hasta ese momento. En private, botón
  **"Switch to standard mode"**: downgrade a managed con confirmación explícita y un aviso
  ámbar con las dos advertencias (NoteFlow pasa a custodiar la clave y técnicamente podría leer las notas, incluidas las
  ya subidas; la passphrase y el recovery code actuales dejan de funcionar — el desbloqueo pasa
  a ser automático con la sesión). Nunca silencioso; requiere estar desbloqueado (sin pedir
  ningún secreto).
- **Gating por suscripción:** exigen la entitlement `cloud` **crear las claves** (la elección de
  modo del estado `no-keys` — configurar una nube que no podrías activar no lleva a ninguna parte)
  y el botón **Enable sync**. En ambos casos, en su lugar: mensaje "requires subscription" + el
  **mismo bloque de planes** que Ajustes → Cuenta — NoteFlow Cloud y, si tampoco tienes AI, el
  Bundle con badge "Best value" —, cada card clickable para abrir su checkout. **Unlock, Sync now,
  Disable y Lock funcionan sin suscripción**: quien ya tiene claves y datos subidos puede seguir
  desbloqueando y bajándose sus notas aunque caduque.
- **Sin sesión**, el panel ya no se limita a pedirte que inicies sesión: muestra también esos
  precios, y clicar cualquier card lleva a Ajustes → Cuenta para crear la cuenta sin salir de Ajustes.
- Antes de activar con GitHub Sync conectado, aviso ámbar: "GitHub Sync quedará en pausa" (solo
  cuando activar Cloud está realmente al alcance, es decir con la entitlement `cloud`).

Detalle técnico (jerarquía de claves, modos managed/e2ee, motor de sync):
`.claude/context/monetization.md` § 4.

---

## GitHub Sync

Settings → Sync (tarjeta "GitHub Sync" del selector de backend).

### Conectar
1. Introduce el nombre del repositorio privado donde se guardarán las notas.
2. **Device Flow OAuth** — aparece un código de verificación.
3. El usuario visita `github.com/login/device`, introduce el código y autoriza.
4. La app detecta la autorización y conecta.

### Comportamiento tras conectar
- **Al arrancar**: pull automático (solo sobreescribe si el remoto es más nuevo).
- **Cada 5 min**: pull automático en segundo plano.
- **Al guardar**: push automático con debounce (~5s). El icono ☁ indica cuándo está subiendo.
- **Al borrar**: el archivo se elimina también del repo remoto.
- Se sincronizan notas + `groups.json`, `folders.json`, `section-colors.json`, `note-order.json`,
  `templates.json`, `ui-settings.json` (apariencia y ajustes del editor).
- El repositorio se crea como **privado** automáticamente si no existe.

### Panel de sync
- Estado (conectado / subiendo / error), cuenta y repo vinculados.
- "Sync now" para pull manual · "Disconnect" para desconectar.
- **"Mirror to GitHub" / "Espejar en GitHub"** — botón que aparece entre los dos anteriores **solo
  con NoteFlow Cloud activado** (es entonces cuando GitHub queda en pausa como espejo de solo
  escritura y el repo se va quedando obsoleto: no le llegan los borrados ni las notas que Cloud
  trae de otros dispositivos). Pide confirmación y deja el repo como **copia exacta** de lo que hay
  en este dispositivo: sube lo que falte o difiera y **borra del repo** lo que ya no exista aquí
  (nunca toca el README ni ficheros ajenos al formato). Las notas locales no se modifican. Al
  terminar informa de cuántos ficheros subió y borró.

### Privacidad
- Repo siempre **privado**. Token cifrado con el SO (`safeStorage`), nunca sale de la máquina.
- Sin servidor intermedio — comunicación directa con la API de GitHub. Sin telemetría.

---

## Cuenta NoteFlow (Settings → Account)

Cuenta opcional para las suscripciones (**NoteFlow AI** — €5.99/mes · €49.99/año; **NoteFlow
Cloud**, con panel en Settings → Sync — €3.99/mes · €39.99/año; **NoteFlow Bundle**, AI + Cloud
juntos — €7.99/mes · €79.99/año). Los tres son comprables: las tres URLs de checkout están
pobladas en la build (precios en `.claude/context/monetization.md` § visión, cifras de display en
`src/lib/subscriptionPlans.ts`). Todo lo gratuito sigue funcionando sin cuenta.

- **Sign-in sin contraseña:** email → "Send code" → código de 6 dígitos por email → "Verify &
  sign in" (misma UX de código que el Device Flow de GitHub). "Use a different email" vuelve atrás.
- **Código incorrecto:** el error NO sale en la caja roja de arriba, sale **pegado al input**
  (icono ⚠ + "That code doesn't match, or it has expired…"), el input se pone con borde rojo y da
  un **shake** corto, y su contenido queda **seleccionado** para reteclear directo; el error se
  borra en cuanto escribes. Junto a "Verify & sign in" hay **"Resend code"** (con cuenta atrás de
  30 s tras cada envío) para pedir otro código sin volver al paso del email — al llegar el nuevo,
  línea "New code sent — check your inbox.". Los mensajes de error vienen **traducidos** (el
  proceso main manda un código de error, no texto en inglés).
- **Con sesión:** muestra el email, badges de plan ("NoteFlow AI" / "NoteFlow Cloud" con estado
  Active/—), la sección de **planes**, botón "Refresh" (relee las suscripciones) y "Sign out".
- **Sección de planes:** cards en orden **Bundle → AI → Cloud**, cada una con nombre y precio
  ("€7.99/month · €79.99/year" para Bundle — con subtítulo "AI + Cloud" y badge **"Best value"** —,
  €5.99/€49.99 para AI, €3.99/€39.99 para Cloud; cifras de `src/lib/subscriptionPlans.ts`). Un plan
  solo aparece mientras falte su entitlement (AI si falta `ai`, Cloud si falta `cloud`, Bundle solo
  si faltan **ambas** — evita pagar dos veces lo mismo); con todo contratado la sección desaparece.
  **Cada card es clickable** (CTA "Subscribe" con estrella) → abre el checkout de Lemon Squeezy en el
  navegador; si una build no trae URL para ese producto, la card indica "Coming soon" y queda inerte.
  Debajo, un único hint genérico: el checkout se abre en el navegador y el plan se activa solo tras el pago
  ("Refresh" si no aparece). Tras pagar AI, **el proveedor NoteFlow AI se activa solo** en
  Settings → AI.
  Es **el mismo bloque** (`PlanOffers`) que ves en los gates de Ajustes → IA, del panel de IA del
  Cerebro y de Settings → Sync → NoteFlow Cloud: allí solo cambia qué planes se ofrecen.
- **Builds sin backend configurado** (`cloudConfig.ts` vacío — no es el caso de las builds
  actuales): el panel solo muestra "NoteFlow account services aren't available in this build yet."
- Privacidad: la sesión (refresh token cifrado con `safeStorage`) vive en el proceso main y nunca
  llega al renderer; detalle técnico en `.claude/context/monetization.md`.

---

## Exportar / Importar notas

Settings → Data → Export / Import.

**Exportar**:
- `.noteflow` (JSON con todas las notas).
- También `.md` / `.txt` (una nota → archivo; varias → carpeta destino).

**Importar**: la pestaña Import abre primero un **selector de origen con tutorial in-app** (textos
en inglés) — cada fuente explica dónde está su botón de exportar y en qué formato:
- **NoteFlow file** → `.noteflow` / `.json`, o `.md` / `.txt` sueltos.
- **Markdown folder** → elige una carpeta de `.md`/`.txt` (p.ej. un vault de Obsidian); las
  **subcarpetas se mapean a grupos/folders**, y se conservan frontmatter YAML y `#tags`.
- **Notion** → export **HTML** (`.zip`) con *Include subpages* + *Create folders for subpages*.
- **Google Keep** → export de **Google Takeout** (`.zip`).

Tras elegir, muestra la misma **preview** con resolución de conflictos (los imports externos llevan
ids/dirs frescos → sin conflicto, y muestran el grupo/folder destino):
- **Skip** → mantiene la versión existente.
- **Overwrite** → reemplaza con la importada.
- **Keep both** → renombra y guarda ambas.

Detalles de los imports externos: el contenido entra en **rich-text** (no raw); las notas **sin
contenido se omiten** (las filas de BD / páginas título-solo de Notion no ensucian); subcarpetas →
grupos (1er nivel) + folders (anidados, aplanados a 2 niveles); imágenes y `.csv` de Notion no se
importan (v1). Implementación en `.claude/context/patterns.md` (importadores + IPC).

---

## CLI companion (`noteflow` en terminal)

Script Node.js standalone (`cli/noteflow.js`) que opera directamente sobre los `.md`, sin
necesidad de tener la app abierta. Útil en headless/RPi y para agentes de IA.

Comandos principales: `add`, `new`, `list`, `get`, `delete`, `rename`, `sections`, `favorite` (alias `pin`),
`archive`, `groups`, `group create/delete`, `login`, `logout`, `push`, `pull`/`update`,
`status`, `self-update`. Los comandos de lectura aceptan `--json`.

> Referencia completa: skill `noteflow-cli` (y `cli/noteflow-cli/SKILL.md`).

---

## Atajos de teclado completos

Fuente de verdad: `src/components/Settings/ShortcutsPanel.tsx`.

### App
| Atajo | Acción |
|---|---|
| `Ctrl+Shift+Space` | Mostrar/ocultar app (global del sistema) |
| `Ctrl+N` | Nueva nota |
| `Ctrl+Shift+N` | Nueva nota temporal (24h) |
| `Ctrl+P` | Command palette |
| `Ctrl+Shift+F` | Buscar en todas las notas (sidebar) |
| `Ctrl+'` | Toggle sidebar |
| `Ctrl+Click` | Abrir nota en paralelo (sobre un tag de sección: esa sección en un panel nuevo) |

### Secciones
| Atajo | Acción |
|---|---|
| `Ctrl+T` | Nueva sección |
| `Ctrl+W` | Eliminar sección |
| `Ctrl+Tab` | Siguiente sección |
| `Ctrl+Shift+Tab` | Sección anterior |
| `Ctrl+A` | Seleccionar todo (secciones en la vista de nota, notas en la vista de grupo) |
| `Delete` | Borrar nota seleccionada (cuando no se edita) |

### Sticky notes
| Atajo | Acción |
|---|---|
| `Ctrl+S` | Abrir sección actual como sticky |
| `Ctrl+G` | Abrir todas las secciones como sticky |

### Editor
| Atajo | Acción |
|---|---|
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+U` | Negrita / Cursiva / Subrayado |
| `Ctrl+E` | Código inline |
| `Ctrl+Shift+B` | Bloque de código |
| `Ctrl+F` | Buscar dentro de la nota |
| `Ctrl+M` | Alternar modo Markdown / rich-text |
| `Ctrl++` / `Ctrl+-` / `Ctrl+0` | Fuente: aumentar / disminuir / reset |

---

## Persistencia y almacenamiento

- Notas en `~/noteflow-notes/` (Windows/macOS) / `~/.local/share/noteflow-notes/` (Linux).
- Junto a ellas: `groups.json`, `folders.json`, `section-colors.json`, `note-order.json`,
  `templates.json`, `ui-settings.json` (todo sincronizable).
- Auto-save con debounce tras cada cambio.
- Formato v2 (carpeta por nota): `note.md` con el frontmatter YAML + un `.md` por sección.
- Carpeta configurable desde Settings → Data → "Choose notes directory".
- Ajustes locales (idioma, autostart, estado de UI, token de sync) en `settings.json` del userData.
  La apariencia (tema, fuente, acento, colores del editor) y los ajustes del editor (tamaño/familia
  de fuente, ancho legible) se sincronizan vía `ui-settings.json`; la escala de UI y el idioma
  siguen siendo por dispositivo.
