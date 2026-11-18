---
name: noteflow-features
description: Funcionalidades, diseño de UI y experiencia de usuario de NoteFlow. Úsala cuando el usuario quiera discutir, mejorar o diseñar features de la app, entender cómo funciona desde la perspectiva del usuario, o planear nuevas capacidades de producto.
---

# NoteFlow — Funcionalidades y Diseño

> **Mantenimiento:** al implementar una feature importante, actualizar esta skill **y** la
> documentación de `.agents/context/` (arquitectura/IPC/release — ver el mapa en `AGENTS.md`). Si
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
┌─ TitleBar (34px) ──────────────────────────────────────────────────┐
│  NOTEFLOW  [🧠 brain] [⬇ update] [☁ sync]        [⚙ settings] [─ □ ×] │
├─ Sidebar (180–480px, redimensionable) ──┬─ Editor area ─────────────┤
│  [🔍 Search...      ] [▦] [📌⮜]        │  [Tabs sección] [⚙]        │
│  [     +     ] [new group]              │  Título de nota            │
│  [           ] [temp note]              │  19/03/2026 · 21:00        │
│                                         │  ──────────────────────── │
│  ─────────────────────────────          │  Contenido (editor)        │
│  favorites                              │                            │
│    NOTEFLOW               20:31 ⭐      │   (Ctrl+Click una nota →   │
│  ─────────────────────────────          │    se abre en paralelo)    │
│  ◥ Work (grupo, cabecera fija)   3      │                            │
│  ┆ Meeting               14:30 ⏱        │                            │
│  ┆ ━━━━━━━ ━━ ━━━━━━━━━━━━━━━━━         │                            │
│  ┆ 📁 Backend (carpeta)       2         │                            │
│  ┆   ┃ NOTEFLOW          20:31          │                            │
│  ┆   ┃ [Urgent◥|▓Features▓▓|Ideas◥]     │                            │
│  ◥ Personal · Diario (plegado)   4      │                            │
│  ─ Sin grupo ──────────────────         │                            │
│    Project: Neural Netw…  19/03         │                            │
│  ─────────────────────────────          │                            │
│  (Y) yagoi · GitHub · notes        ⋯   │                            │
└─────────────────────────────────────────┴────────────────────────────┘
```

`[📌⮜]` = interruptor **fijar / contraer** el sidebar (ver "Sidebar fijado / flotante" abajo).
`◥` = pestaña del grupo (esquina plegada de su color) · `┆` = guía del grupo / de la carpeta · `┃` =
cursor de la nota abierta sobre su guía (ver "Grupos y carpetas" abajo).

### Sidebar fijado / flotante
- **Dos modos.** *Fijado* (por defecto): el sidebar ocupa su ancho en el layout, como siempre.
  *Flotante*: el contenido usa todo el ancho y el sidebar aparece como **panel superpuesto** al
  acercar el ratón al borde izquierdo de la zona de contenido.
- **Interruptor** = el botón junto al buscador (y `Ctrl+'`). Fijado se ve "pulsado"
  (`PanelLeftClose`, tooltip "Collapse sidebar (Ctrl+')"); pulsarlo pasa a flotante. En flotante el
  icono es `PanelLeftOpen` (tooltip "Pin sidebar (Ctrl+')"): se abre el panel con el ratón y se pulsa
  para volver a fijar. **No** hay columna/botón aparte para desplegar. El modo se recuerda entre
  reinicios (ajuste local del dispositivo, no se sincroniza).
- **Mini-vista** (plegado): tira vertical finísima y muy translúcida en el borde izquierdo de la zona
  de contenido, **sin texto**, una marca por fila del sidebar en el mismo orden y respetando
  filtros/archivadas/colapsados: notas = rectangulito con micro-marcas de los colores de sus primeras
  secciones (la activa más marcada), grupos = pastilla de su color (y sus notas debajo con una micro
  línea guía), carpetas = cuadradito contorneado, cabeceras (favorites/groups/notes) = línea fina. Se
  hace más visible al pasar el ratón. Con muchas notas muestra una ventana centrada en la nota activa,
  como un minimapa. El texto del editor deja un pequeño margen izquierdo para no quedar debajo.
- **Panel flotante**: es el sidebar completo (búsqueda, botones, lista, pie), mismo ancho, con borde
  redondeado y sombra; entra deslizando desde la izquierda. Verticalmente ocupa **toda la altura** bajo
  la barra de título (la misma zona que el sidebar fijado), separado un poco de los bordes para que se
  vea flotante. Como en el fijado, la cabecera (búsqueda, botones de nueva nota/grupo) y el pie quedan
  fijos y solo la lista de notas hace scroll. La mini-vista, en cambio, sigue alineada con el texto del
  panel más a la izquierda (bajo pestañas, título y toolbar, o bajo la cabecera del pane en el split, o
  bajo la cabecera de la vista de contenido o la de nota).
- **Abre** al dejar el ratón sobre la mini-vista (~120 ms; no salta si se está seleccionando texto con
  el botón pulsado) o con un click en ella; **cierra** ~200 ms después de salir. Se queda abierto
  mientras haya foco de escritura dentro (búsqueda, renombrar, nuevo grupo/carpeta), un menú
  contextual o modal lanzado desde él, o un arrastre en curso (arrastrar notas al editor → split, a la
  ventana sticky o a otro grupo sigue funcionando). Seleccionar una nota no lo cierra. **Escape** lo
  cierra y devuelve el foco al editor. `Ctrl+Shift+F` lo abre y enfoca la búsqueda.
- La **vista cerebro** no cambia: su sidebar de notas se muestra/oculta aparte (columna de 24 px),
  nunca flota.

### Item de nota del sidebar (mapa plegado)
Cada nota del sidebar muestra título + fecha (con candado si está cifrada y reloj si es temporal) y,
debajo, sus **secciones** en el lenguaje del mapa de secciones del editor:
- **Nota cerrada → línea plegada:** una línea fina con un tramo por sección, del color de la sección y
  tan ancho como larga es la sección (las vacías, un tramo mínimo). Al pasar por la fila, la línea se
  engrosa y se satura un poco (sin mover la lista). Con muchas secciones los tramos se estrechan, nunca
  se salen. Las ocultas a la IA, más tenues.
- **Despliegue:** si dejas el ratón quieto un instante (~0,3 s) en **cualquier parte de la fila** de
  una nota cerrada con 2 o más secciones, aparece **a la derecha de la barra** (alineado con la fila)
  el mapa de esa nota con los nombres, en un panel algo más ancho que la línea (las celdas salen de sus
  tramos). La línea sigue a la vista y, al pasar por una celda del panel, se resalta su tramo y se
  atenúan los demás. Barrer la lista con el ratón no lo abre; con un panel abierto, pasar a otra nota
  lo cambia casi al instante, y al ir en diagonal hacia el panel las filas que cruzas no se lo quedan
  (solo si te paras en una). Se cierra al salir de fila y panel (con un margen para cruzar el hueco),
  al hacer scroll o al teclear. Sus celdas tienen la preview de sección al hover (a la derecha del
  panel, sin taparlo) y el menú de sección con clic derecho; **clic en una celda** abre la nota en esa
  sección: el panel se va y el mapa de la nota se despliega desde su línea, como al abrirla
  (Ctrl/Cmd+clic → esa sección en un panel al lado). Si la ventana no deja sitio a la derecha, el panel
  flota encima de la línea, y entonces al hacer clic se convierte en el mapa de la nota sin cortes.
- **Nota abierta → mapa:** la línea se despliega en un bloque de celdas (como las pestañas del editor,
  en pequeño, bajando de fila si no caben): neutras con la esquina doblada del color, la sección abierta
  en sólido y más ancha. Al cambiar de sección o de nota todo se reparte con una animación suave (sin
  animación si el sistema pide reducir el movimiento); la nota que dejas vuelve a su línea. Las celdas
  se pueden recorrer con Tab y abrir con Enter/Espacio. **Máximo 2 filas** (el editor, 3): con muchas
  secciones, las que no caben se agrupan en una celda **`+N`** (la sección abierta siempre se ve);
  pulsarla despliega todas y aparece una celda con una flecha hacia arriba para volver a plegar. Ni una
  ni otra abren la nota (con teclado, el foco pasa a la que aparece). Al cambiar a otra nota, el mapa
  vuelve a plegado. Si una búsqueda coincide con secciones de la nota, se ven todas (ninguna coincidencia
  queda escondida); en el despliegue flotante también se ven siempre todas.
- **Clic en la fila** (fuera de las celdas): por defecto abre la nota en el editor **en su primera
  sección**, tenga las secciones que tenga. Con Settings → Editor → **Clicking a note opens** en
  `Note overview`, una nota con **más de una sección** abre en su
  [Vista de nota](#vista-de-nota-note-overview); las de una sola sección siguen yendo al editor. Una
  nota cifrada y bloqueada se abre sin más en el editor (pide desbloquear). El clic en una **celda**
  de sección va siempre a esa sección en el editor, sea cual sea el ajuste.
- **Buscando:** las notas cuyas secciones coinciden muestran el mapa desplegado sin apuntar a nada; con
  `#sección`, solo las secciones que encajan (como antes); con texto, todas, las coincidentes teñidas de
  su color y el resto atenuadas, con el término resaltado. Si la nota solo coincide por el título, se
  queda con su línea.
- Una nota **cifrada y bloqueada** no muestra secciones (no hay contenido en memoria).
- **Ajustes → Apariencia → "Sections in the sidebar":** *Folded map* (por defecto, lo de arriba) o
  *Scroll row*: las secciones de cada nota siempre visibles en una sola fila con scroll horizontal
  (bordes difuminados y flechas al desbordar), con las celdas del diseño nuevo a su ancho natural y la
  abierta en sólido; sin línea ni despliegue. Solo para este dispositivo (no se sincroniza). También desde el menú ⋯ del footer (*As map* / *As row*).
- El peek de un grupo colapsado sigue **el mismo ajuste** (línea plegada con su despliegue —que sale a
  la derecha del peek— y mapa en la nota activa, o fila con scroll), en tamaño compacto. La **vista de contenido** enseña **siempre** todas
  las secciones de cada nota como celdas en varias líneas (sin scroll), sea cual sea el ajuste.

Iconos del TitleBar:
- **⬇ update**: aparece solo si hay una versión nueva; descarga e instala in-app (muestra el %
  de descarga y luego un spinner "Installing…").
- **☁ sync**: estado del backend de sync **activo** (NoteFlow Cloud o GitHub; oculto si no hay
  ninguno). Icono: nube verde = sincronizado · verde pulsante = subiendo cambios · ↻ girando =
  sincronizando · nube ámbar = error · nube tachada ámbar = bloqueado (claves de Cloud sin
  desbloquear o primer pull fallido) · nube con flecha ámbar = **cambios sin subir** (el journal del
  backend aún tiene subidas/borrados que no llegaron, p. ej. pushes que fallaron sin red: nunca se
  muestra "Synced" mientras queden) · **triángulo ámbar** = **hay que elegir** (píldora "Action needed":
  las notas de este dispositivo vienen de otro repo que el conectado y no se sincroniza nada hasta
  elegir; el click abre ese diálogo en vez de sincronizar, y la tarjeta lo explica con un botón
  "Choose…" — ver "GitHub Sync" → "Conectar a otro repositorio"). **Click** = sync manual **completo**: baja lo remoto **y
  reintenta lo pendiente de subir** (Cloud: el mismo ciclo que el auto-sync; GitHub: drena su journal y
  luego hace pull) — no hay que esperar al tick de 5 min. **Hover** (~450 ms) abre una
  mini-tarjeta flotante (`SyncStatusButton.tsx`, sin tooltip nativo; ~208 px) bajo el botón:
  cabecera de **una sola fila** con el nombre del repo (GitHub; `owner/repo` en el tooltip) o
  "NoteFlow Cloud" + píldora de estado (Synced / Uploading / Syncing / Error / Locked / Blocked /
  Pending / Not uploaded); filas *Last sync* (relativo; hora exacta en el tooltip) y *Pending uploads*
  (cambios del journal aún no subidos, incluidos los que están subiendo; las ediciones dentro del
  debounce de 5 s no cuentan); con *Not uploaded*, aviso ámbar "Some local changes haven't been
  uploaded yet…"; una
  **mini gráfica de barras** de la actividad de sync de esta sesión (una barra por minuto con
  actividad, hasta 24, la más reciente a la derecha; altura ∝ ficheros movidos, stub mínimo si
  fueron 0; verde = bien, ámbar = falló; tooltip "14:32 · 3 files"; crecen al abrir salvo con
  *reduced motion*; vacía → línea discontinua + "No activity yet"; con el latido del auto-sync cada
  5 min, las 24 barras abarcan ~las últimas 2 h) con leyenda "last N syncs" / "X files today" (total
  acumulado del día local en esta sesión, llevado en main — no la suma de las barras); bloque ámbar con el error si lo hay;
  bloque ámbar de **copias de conflicto** (NoteFlow Cloud o GitHub, el backend activo: "Your edits to
  N note(s) conflicted with changes made on another device and were kept as conflict copies:" + hasta 3
  títulos y "+N more", botón *Dismiss*; mientras no se descarta, el botón muestra un **punto ámbar**
  y su `aria-label` lo menciona) y, en el mismo bloque, el de **notas fusionadas con conflictos**
  (NoteFlow Cloud o GitHub: "N note(s) were changed on the same lines here and on another device. Both
  versions were kept in the note — look for the ⚠️ markers:" + títulos; mismo *Dismiss* y punto); y pie compacto de **iconos con tooltip**:
  candado (Cloud: cifrado Standard / Private E2EE), rayo (Cloud: verde si Real-time conectado),
  reloj ("Auto-sync every 5 min") y a la derecha el engranaje que abre Ajustes → Sync. La acción
  del click ("Click to sync now" / "Click to retry" / "Unlock in Settings → Sync") va en el
  `aria-label` del botón. Sigue abierta al hacer click (se ve el sync en vivo), se mantiene al pasar
  el ratón a la tarjeta y se cierra al salir (~150 ms), al perder el foco la ventana o al redimensionar;
  mientras está abierta re-lee el estado cada 30 s.
- **⚙ settings**: abre la **ventana de Ajustes** (overlay tipo app de settings) con nav izquierda
  + panel derecho, **en General** (la primera de la nav). Secciones, **en el orden en que aparecen
  en la nav**: **General** (idioma de la
  interfaz: System/English/Español; debajo, la sección **Activity**: cabecera con "since <mes año>"
  (mes y año de la nota más antigua por `created`, en el idioma de la UI); **4 tarjetas de cifras**
  (notas —todas, archivadas incluidas—, secciones, palabras —abreviadas desde 1000, "85 k"— y
  tareas hechas "70 / 161" con barra de progreso fina; una nota cifrada bloqueada cuenta como nota
  pero no aporta secciones/palabras/tareas; palabras y tareas con las reglas del pie de las tarjetas
  de sección, `markdownTextStats`); después el bloque **"The notes you keep coming back to"**
  (seguido de un tenue "· per device", porque las tiras salen del log local; a la derecha
  "last 4 weeks"): las **4 notas tocadas más días** en los últimos 28 (hoy incluido), cada una
  con su título, una **tira de 28 celdas** (4 bloques de 7 días, de más antiguo a hoy; tocada =
  acento del tema, más tenue fuera de la primera fila; sin tocar = tinte tenue del texto atenuado; tooltip
  nativo con fecha · touched/not touched · today) y "N days" a la derecha; debajo, un eje con la
  fecha de inicio de cada bloque y "today". Sin pie de recuentos; sin notas tocadas, un texto
  vacío en lugar de las tiras. "Tocada un día" = el id está en el **log de actividad de este dispositivo**
  (`userData/activity-log.json`: ids de las notas que el usuario editó ese día en la app —editor,
  sticky, ventana de sección, menús/overviews y las ediciones del agente del chat—; nunca sync,
  imports, migración ni autoborrado) **∪** el día de su `updated` **∪** el día de su `created`;
  solo notas que siguen en el store (las borradas no tienen título). El log solo existe desde que
  el dispositivo empezó a registrar; antes solo se conoce la **última** edición de cada nota.
  Ranking: más días primero, luego la tocada más recientemente. Colores solo de tokens del tema;
  `ActivitySummary.tsx` + `src/lib/activitySummary.ts`), **Appearance** (tema/fuente/acento/colores del editor/escala/secciones del sidebar/vista cerebro),
  **Editor** (fuente/tamaño/ancho/índice/tareas marcadas al final/qué abre el clic en una nota) — grupo **Preferences** —; **Sync** (NoteFlow Cloud + GitHub),
  **AI** (sección **Assistant** con el proveedor del LLM y sección **Your notes and AI**: **Local AI**
  —toggle de embeddings; activada, "N notes" y botón "Reindex" con progreso—, **Profile** —"Redo
  questionnaire" → abre el cerebro en la pestaña Profile y cierra Ajustes— y **CLI skill** —toggle:
  copia la skill del CLI a `~/.claude/skills` y `~/.agents/skills`, y a Windsurf si está instalado),
  **Account** (cuenta NoteFlow) — grupo **Services** —; **Data** (export/import + carpeta
  de notas), **Startup** (autostart + stickies), **Templates** (plantillas de nota) — grupo **Your
  notes** —; y **Tutorial** (el tour "What's new", ver abajo), **Keyboard shortcuts** y **About**
  (versión + updates + **Send feedback** + enlaces: repo de GitHub y **Latest release notes**, que abre
  `github.com/yagoid/noteflow/releases/latest` en el navegador) — grupo **Help**. **Send feedback** es un formulario
  para reportar bugs / sugerencias / lo que sea: tipo (Bug · Suggestion · Other, control segmentado),
  mensaje (máx. 5000 caracteres, contador, `Ctrl+Enter` envía), email opcional "solo si quieres
  respuesta" (validación laxa), checkbox **Include app and system version** (opt-in real, **desmarcado** por
  defecto y al limpiar tras enviar: versión de la app, SO + arquitectura y su versión, idioma de la
  interfaz) y nota de privacidad (va a los servidores de NoteFlow, nunca incluye notas; con sesión
  queda vinculado a la cuenta) con enlace a la política de privacidad de la web (`/privacy#feedback`). **No exige
  cuenta**. Estados Sending… / "Thanks!" (limpia el formulario) / error con hint de reintentar. Se
  guarda en la tabla `feedback` de Supabase y el desarrollador lo lee desde el dashboard
  (`FeedbackSection.tsx`, IPC `feedback:send`; ver `architecture.md` y `supabase/README.md` § 8). Cada grupo lleva un título pequeño en mayúsculas y
  un espacio de separación en la nav. Tamaño fijo proporcional a la ventana de la app. El orden y los grupos viven en el array `NAV` de
  `SettingsModal.tsx`; las labels vienen del diccionario i18n por id. La paleta de comandos y los
  atajos pueden abrirla directamente en otra sección (p. ej. shortcuts, startup, sync).
- Controles de ventana: minimizar / maximizar / cerrar (cerrar = ocultar al tray).

---

## Gestión de notas

### Crear
- `Ctrl+N` → nota nueva instantánea.
- `Ctrl+Shift+N` → **nota temporal** (se autoelimina en 24h).
- Botón grande **`+`** (solo icono, sin texto; tooltip "New note (Ctrl+N)…") en el sidebar, bajo el
  buscador. A su derecha, una columna con dos botones-icono apilados de la misma altura total:
  arriba **nuevo grupo** (`FolderPlus`) y debajo **nota temporal** (`Timer`). **Click derecho** sobre
  el `+` → "Temporary note (24h)" y **"Link file…"** (ver "Notas vinculadas").
- Desde el tray (menú o `New Note`).

### Organizar
- **Favorites** → aparece en la sección "favorites" al top del sidebar (etiqueta pequeña + notas planas). La nota también sigue visible en su grupo si tiene uno. Toggle desde el menú contextual o el botón ⭐ en la toolbar del editor.
- **Drag-to-reorder** → las notas se pueden arrastrar dentro de su contexto (favorites, grupo, carpeta o sin grupo) para fijar un orden manual. El orden persiste en `note-order.json` (sincronizado con GitHub). Una línea indicadora muestra dónde se insertará la nota al soltar.
- **Drag-to-move (entre grupos/carpetas)** → arrastrar una nota y soltarla sobre **otro grupo** (cabecera o cuerpo) la reasigna a la raíz de ese grupo; soltarla sobre una **carpeta** la mueve a esa carpeta. Mientras se arrastra, el destino se marca con un **subrayado del color del grupo** que crece bajo su cabecera, su guía a pleno color, el resto de la lista atenuado y, al final de su lista, un hueco discontinuo **"Drop in {nombre}"** (si la nota no está ya ahí). Un grupo o carpeta **plegado** se abre solo tras ~650 ms encima (y se queda abierto). Reordenar dentro del mismo contexto y mover a otro distinto conviven en el mismo gesto (la cabecera de un grupo colapsado también es zona de drop). Equivale a `updateNote({ group, folder })`; sin IPC nuevo.
- **Archive** → se oculta de la lista principal (toggle "Show archived" en el menú ⋯ del footer).
- **Duplicate** → copia completa con todas sus secciones; conserva el grupo y la carpeta de la original.
- **Open alongside** → abre la nota en paralelo (vista dividida) junto a la actual.
- **Asignar a grupo / carpeta** → drag & drop o menú contextual.
- **Delete** → con confirmación modal.

### Propiedades de una nota
- Título editable (auto-save). Título por defecto: `DD/MM/YYYY`. **Enter** en el título lo confirma y
  lleva el foco al cuerpo de la sección activa con el cursor al principio (Modo markdown y Modo texto;
  no actúa durante composición IME ni con modificadores).
- Una nota **recién creada** (`+`, `Ctrl+N`, nota temporal, *Duplicate*, *New note* de grupo/carpeta,
  paleta, tray) se abre con el **título enfocado y seleccionado** para escribir el nombre encima; el
  cuerpo no se autoenfoca en ese caso (`newlyCreatedNoteId` del store → `titleClaimsFocus` en
  `NoteEditor.tsx`, que apaga el `autoFocus` del `Editor` al montar). Las notas desde plantilla o perfil
  IA no (`createPopulatedNote`). Abrir una nota existente sigue enfocando el cuerpo.
- Tags: extraídos automáticamente del contenido con `#nombre`.
- Timestamps: `created` y `updated` automáticos. Cada **sección** guarda además su propio `created`
  (al crearla); las secciones antiguas sin él muestran la fecha de creación de la nota.
- Bajo el título, el editor muestra `Created <fecha · hora>`: la creación de la **sección activa**
  (cambia al cambiar de pestaña; en split, la de cada panel). No se muestra la fecha de edición.
- Estado: favorited, archived, encrypted, temporary (`expiresAt`).
- Ubicación: `group` (opcional) y `folder` (opcional, dentro del grupo).

---

## Notas temporales

- Se crean con `Ctrl+Shift+N`, desde el click-derecho en el botón grande `+` (nueva nota), o con el
  **botón-icono de reloj** (`Timer`) de la columna a su derecha, debajo del botón de nuevo grupo.
- Llevan `expiresAt` en el frontmatter (24h desde su creación; se puede reprogramar, ver abajo).
- El proceso principal **borra automáticamente** las vencidas (también del remoto si hay sync).
  Sin sync, comprueba al arrancar y cada minuto; **con sync, solo justo después de un pull que haya
  ido bien** (para no borrar una nota que otro dispositivo hizo permanente), así que puede borrarse
  unos minutos tarde y, sin conexión, no caduca hasta el siguiente pull correcto.
- En el sidebar se distinguen por un icono de reloj (⏱) junto a la hora.
- Dentro del editor, tras la fecha `Created …` se muestra `Deletes <fecha · hora>` (con
  icono de reloj, en tono de acento) indicando cuándo se autoeliminará.
- **Mini menú de caducidad** (`TempNoteExpiryMenu`): justo después de `Deletes …` hay un chevron
  (`ChevronDown` 11px, `text-accent/50`, sin borde ni fondo; se ilumina a `text-accent` en hover o
  abierto). Abre un popover con el estilo de los menús de la app (cierra con click fuera, Escape o al
  elegir):
  - **"Delete in"** + fila de chips **1h · 8h · 12h · 24h · 48h**: fija `expiresAt = ahora + N h`
    (`notesStore.setNoteExpiry`; puede acortar o alargar, siempre relativo al momento del click).
  - Separador + **"Make permanent"** (icono `TimerOff`): quita `expiresAt` (`makeNotePermanent`) y la
    nota pasa a ser normal: desaparecen el badge del editor y el reloj del sidebar, y vuelve a entrar
    en grafo, related, link picker y sugerencias del chat.
  - Ambas acciones: sin confirmación, bumpean `updated` y solo reescriben `note.md` (la escritura vale
    con notas cifradas; en la UI el menú solo aparece con la nota desbloqueada). Solo están en este mini menú (no en el menú ⋯ del editor, ni
    en el contextual del sidebar, ni en la paleta). Con sync, los demás dispositivos reciben la versión
    nueva antes de poder caducarla (ver `patterns.md` § "Motor de alarmas y notas temporales").
- Las temporales **no entran** en el grafo del cerebro, la vista Related, el link picker de
  secciones ni las sugerencias del chat (filtran por `expiresAt`).

---

## Notas vinculadas (archivos de texto externos)

Abrir un archivo de texto que ya existe (el README de un proyecto, una página de un sitio Docusaurus/Astro…,
o un `config.json`, un `.yaml`, un script, un log) y editarlo **donde está**, sin importarlo ni copiarlo: lo
que escribes se guarda en el archivo original (y aparece en el proyecto y en su historial de Git) y lo que
cambie fuera de NoteFlow aparece en la nota. Diseño e invariantes técnicos: `patterns.md` § "Notas vinculadas".

- **Vincular:** click derecho en el `+` grande → **"Link file…"**, o la paleta (`Ctrl+P` → "Link file…"):
  selector nativo (filtros "All files" —por defecto— y "Markdown", varios a la vez). O **arrastrar** uno o
  varios archivos desde el explorador a cualquier parte de la ventana (sale un marco discontinuo "Drop to link
  the file"): un archivo soltado sobre el editor **se vincula**, no se inserta como texto; las imágenes
  arrastradas al editor siguen insertándose como siempre. Solo **archivos de texto** (UTF-8): un binario (PDF,
  imagen, Office…) o un texto en otra codificación se rechaza con un aviso ("Some files could not be linked"
  · "not a text file" / "not UTF-8 text"). Por seguridad solo se vincula lo que el usuario **elige** en el
  selector o **suelta** desde el sistema (nada que la app pida por su cuenta). Si el archivo ya estaba
  vinculado se abre esa nota (no se duplica).
  Tras vincular se abre la nota. La **primera vez** en el dispositivo un aviso explica que se edita en su
  sitio, que los no-Markdown se abren siempre en Modo texto y que es **solo local** (no se sincroniza con
  NoteFlow Cloud ni GitHub, ni se exporta). No se pueden vincular archivos de dentro de la carpeta de notas.
- **Abrir desde el sistema ("Abrir con NoteFlow")**: al instalarla, NoteFlow aparece en **"Abrir con…"** del
  Explorador / Finder / el gestor de archivos para `.md`, `.markdown` y `.txt` (y en la lista de apps
  predeterminadas; nunca se pone como predeterminada por su cuenta). También vale `NoteFlow archivo.md` desde
  una terminal, o "Abrir con → Elegir otra aplicación" con cualquier archivo de texto. La ventana pasa al frente
  y el archivo se abre en el **panel activo** (varios a la vez: el primero ahí y un par más al lado; el resto
  queda en el sidebar), **sin** el aviso del primer vínculo. Se abre como **nota temporal** (como la pestaña de
  vista previa de VS Code): en el sidebar, título en *cursiva* + "temporary"; en la cabecera, "· Temporary" y el
  botón **"Keep in NoteFlow"** (en la sticky, un icono de chincheta). Se va sola —se desvincula; el archivo no
  se toca— al **cerrarla**: abrir otra nota en ese panel, cerrar el panel, su sticky o su ventana de sección, o
  salir/reiniciar la app. **Nunca** con cambios sin guardar o un conflicto: se queda (temporal) hasta que se
  resuelvan, también tras reiniciar. **Editarla no la mantiene**; sí la mantienen "Keep in NoteFlow" y
  organizarla: renombrarla, moverla a un grupo/carpeta, marcarla como favorita, archivarla o arrastrarla en el
  orden manual. Mientras es temporal la IA local no la indexa. Si el archivo ya estaba vinculado, se abre esa
  nota tal cual. Un binario se rechaza con "Some files could not be opened". (No confundir con las notas
  temporales de 24 h.)
- **Markdown o texto plano**: un `.md`/`.markdown` funciona como se describe abajo (Modo markdown, imágenes,
  etiquetas…). **Cualquier otro archivo de texto** (`.json`, `.yaml`, `.txt`, `.py`, `.log`…) es **texto
  plano**: se abre **siempre en Modo texto** (textarea en monoespaciada, byte a byte, un `---` inicial de un
  `.yaml` se ve tal cual) y no hay forma de pasarlo a Modo markdown (sin opción en el menú ⋯ ni en la vista
  de nota; `Ctrl+M` no hace nada), ni barra de formato, menú `/` o fragmentos; no admite imágenes; sus `#`
  no son etiquetas; los previews (hover, vista de nota, vista de contenido, cerebro) lo muestran como texto
  preformateado. Su título por defecto **conserva la extensión** (`config.json`) y en el sidebar lleva un
  icono de archivo de código en vez del de vínculo Markdown. Sin resaltado de sintaxis.
- **Una nota = una sección**: el archivo entero es su única sección, con el nombre del archivo; no se
  pueden añadir, duplicar, renombrar, borrar ni reordenar secciones (sin `+` en el mapa de secciones ni en
  la vista de nota, sin esas opciones en los menús, `Ctrl+T`/`Ctrl+W` no hacen nada). El **título** por
  defecto es el nombre del archivo (sin `.md` en Markdown) y es un **alias local**: editarlo nunca renombra
  el archivo.
- **Cabecera** bajo el título: icono de vínculo, ruta acortada (`…/docs/README.md`; tooltip con la ruta
  completa, click = copiarla), estado (`Up to date`…), "· Local only" (tooltip: no se sincroniza) y tres
  iconos: **Mostrar en carpeta**, **Volver a localizar…** (elige otro archivo y conserva título, grupo,
  favorito…) y **Desvincular**. En la ventana sticky va una barra compacta (nombre del archivo, estado,
  mostrar en carpeta y, en conflicto, las tres opciones). En el sidebar, un icono junto al título (vínculo
  para Markdown, archivo de código para texto plano; gris si todo va bien; ámbar en solo lectura/conflicto;
  rojo si falta o no se puede leer).
- **Modo markdown sin extras** (solo `.md`): abre en Modo markdown pero sin la sintaxis propia de NoteFlow — sin
  subrayado/resaltado (`++`/`==`), sin tableros kanban, sin "Link section" y sin fecha/alarma/importancia
  en las tareas (las casillas `- [ ]` normales sí); lo que el archivo ya tenga de esa sintaxis se ve como
  texto y se conserva tal cual. El **Modo texto** sigue disponible para editar byte a byte (muestra el texto
  exacto del archivo). Abrir la nota o cambiar de modo **nunca** reescribe el archivo; al editar en Modo
  markdown, los bloques que no tocaste conservan su escritura original (un cambio pequeño = un diff pequeño).
  El frontmatter YAML (Docusaurus/Astro) no se muestra y se conserva byte a byte; también el BOM, los
  saltos de línea (CRLF/LF) y si acababa o no en salto de línea. NoteFlow nunca añade nada propio al archivo.
- **Imágenes** (solo `.md`): pegadas o arrastradas se copian a una carpeta `assets/` junto al `.md` (se crea si no
  existe) y se enlazan con ruta relativa (`assets/…png`). Las imágenes relativas que ya tenga el archivo se
  ven también en el editor y en los previews.
- **Integración**: es una nota más — grupos y carpetas, favoritos, archivar, búsqueda, paneles del split,
  ventana de sección, sticky, vista de nota/contenido, cerebro, Related, chat y tools de la IA (que pueden
  editar su contenido, nunca crear secciones). **No aplica:** cifrado, notas temporales de 24 h, export, sync,
  CLI. **Duplicate** crea una nota normal (copia del contenido; sus imágenes relativas se copian dentro de la nota;
  un texto plano se copia como **un bloque de código** con su lenguaje —```` ```json ````—, en Modo texto).
  "Save as template" sí (crear desde la plantilla da una nota normal, con la misma regla). La IA local la
  indexa también si es texto plano; para que un `.json` o un log no meta ruido, **"Hide from AI"**.
- **Desvincular / borrar**: "Delete note" en una vinculada se llama **Unlink** y pide confirmación
  diciendo que el archivo **no se borra ni se toca**; la quita de NoteFlow (se puede volver a vincular).
  Igual desde la multiselección de la vista de contenido (el aviso indica cuántas son vinculadas) y desde
  el chat (`delete_note` solo desvincula).
- **Cambios externos**: si el archivo cambia fuera (otro editor, `git pull`/`checkout`) y la nota no tiene
  ediciones sin guardar, se recarga sola en todas las ventanas. Si las tiene, **conflicto**: banner ámbar
  "Changed outside NoteFlow" con **Reload** (descarta lo mío y toma el disco), **Keep my version**
  (sobrescribe el archivo, con confirmación) y **Compare…** (modal con las dos versiones lado a lado —
  "On disk" / "Mine" — y una pestaña para editar un resultado combinado y guardarlo). Mientras dure, no se
  escribe nada en el archivo (lo que escribas se queda en NoteFlow).
- **Estados**: al arrancar, **"Checking the file…"** unos instantes (se ve el último contenido conocido, en
  solo lectura, mientras se lee el archivo; la app no espera a una unidad de red lenta para abrirse); archivo
  **no encontrado** (movido/borrado: se ve su último contenido en solo lectura con "Locate file…"; si vuelve a
  aparecer en la misma ruta, vuelve a la normalidad), **solo lectura** (sin permiso de escritura), **no se
  puede leer** (más de 2 MB —también para texto plano y logs—, no es UTF-8 válido, pasó a ser binario,
  permisos): siempre en solo lectura con un aviso. Un texto plano con saltos de línea antiguos de Mac (solo
  CR) se ve, pero en **solo lectura** ("Read-only file") para no reescribirlos. Se re-evalúa
  al volver a la ventana. El estado se refleja en el icono del sidebar.
- **Cambios sin guardar**: si escribiste algo que aún no está en el archivo (el archivo pasó a solo lectura o
  desapareció justo entonces, o hay un conflicto), la cabecera dice **"Unsaved changes"** (nunca "Up to date")
  y el icono del sidebar se pone ámbar. Esos cambios no se pierden: se guardan aparte en el equipo (también
  si cierras la app) y se escriben solos en cuanto el archivo se pueda escribir; si el archivo cambió
  entretanto, sale el conflicto para que elijas. El aviso dice la causa (solo lectura, demasiado grande…) y
  ofrece **"Discard my changes"** (con confirmación) para volver al contenido del archivo. Si usas "Volver a
  localizar…" con cambios sin guardar, no se pierden: salen como conflicto con el archivo nuevo.
- **Orden manual**: una nota vinculada se puede reordenar entre las demás de su grupo/carpeta; ese orden se
  guarda solo en este equipo (los demás nunca ven la nota ni su id).
- **Limitaciones**: el "deshacer" de las ediciones del chat no está disponible en notas vinculadas; un
  archivo con saltos de línea mezclados se normaliza al predominante en la primera edición.

---

## Atrás / Adelante (navegación tipo navegador)

- Los **botones laterales del ratón** (atrás/adelante), `Alt+←/→` en Windows/Linux y `⌘[` / `⌘]` en
  macOS recorren las ubicaciones visitadas en la ventana principal: notas abiertas en el editor, la
  **vista de nota**, la **vista de contenido** (con su lugar: todo, favoritas, un grupo o carpeta) y
  la **vista cerebro**. Adelante deshace el Atrás; navegar a algo nuevo tras un Atrás descarta lo
  que había delante. Hasta 50 entradas.
- Cambiar de pestaña dentro de la misma nota no añade un paso: Atrás vuelve a la nota anterior **en
  la sección donde la dejaste**.
- Con paneles en paralelo, el historial sigue al **panel activo**: Atrás cambia la nota de ese panel
  (o enfoca el panel que ya la muestra) y deja los demás como están.
- Las notas borradas desaparecen del historial; las cifradas bloqueadas se saltan.
- Con un diálogo, la paleta, Ajustes o un menú/menú contextual abierto no navega (no cambia la nota
  por debajo).
- Dentro de una tabla `Alt+←/→` sigue siendo mover columna. Las ventanas de sección, sticky y chat no
  tienen historial (los botones del ratón no hacen nada allí).

## Vista en paralelo (split)

- `Ctrl+Click` sobre una nota, o "Open alongside" en el menú contextual, abre una **segunda nota
  lado a lado** en el área del editor. Si la nota ya está en un panel, lo enfoca (no la duplica).
- **Dos secciones de la MISMA nota a la vez:** `Ctrl/Cmd+Click` sobre un **tag de sección** (sidebar)
  o "Open alongside" en el menú contextual de la sección abre un **panel nuevo en esa
  sección**, aunque la nota ya esté abierta en otro panel. Si ya hay un panel exactamente en esa
  nota+sección, lo enfoca. Cada panel tiene sus pestañas y recuerda su propia sección; se editan a
  la vez sin pisarse (cada guardado solo toca la sección que edita ese panel).
- Con varios paneles de la misma nota, la cabecera del panel muestra **"Nota · Sección"**.
- Paneles reordenables (asa "Drag"), redimensionables por el borde y cerrables (✕). Borrar en un
  panel la sección que otro tiene abierta hace que ese otro caiga a la primera sección.
- Permite comparar o trabajar con dos notas a la vez sin abrir ventanas sticky.

## Abrir sección en otra ventana

- Menú contextual de una **sección** → "Open in New Window", o paleta de comandos → "Open section in
  new window" (actúa sobre la sección del panel activo). No está en el menú ⋯ del editor. El menú
  contextual de una **nota** también lo ofrece (en la sección en que se abriría la nota).
- **Arrastrar una nota fuera de la ventana** (desde la barra lateral o la vista de todo el contenido) y
  soltarla fuera de NoteFlow abre esa nota en ventana nueva, **cerca del punto donde se soltó** (en la
  sección en que se abriría la nota). Soltarla dentro sigue igual (sobre el editor → en paralelo). No
  hace nada si otra app acepta el drop (p. ej. un editor de texto que inserta el id), con varias notas
  seleccionadas a la vez ni con notas cifradas.
- **No disponible para notas cifradas** (se edita en la ventana principal). Si una ventana ya abierta
  muestra una nota que se cifra después, pasa a solo lectura (pide la contraseña para verla).
- Abre una ventana **solo-editor** (sin sidebar): barra de título propia con "Nota · Sección" y
  minimizar/maximizar/cerrar; normal (NO siempre encima), redimensionable. Muestra el editor completo
  de la nota (pestañas incluidas) abierto en esa sección; puedes cambiar de sección dentro.
- Se pueden abrir varias. Reabrir la sección que una ventana ya muestra la enfoca en vez de duplicarla.
- Cerrarla la destruye (no va al tray). Los cambios se sincronizan en vivo en ambos sentidos con la
  ventana principal (y con otras ventanas/stickies).
- Atajos dentro: `Ctrl+T/W` (sección nueva/borrar), `Ctrl+M` (modo texto/markdown), `Ctrl+F` (buscar), `Ctrl+S/G`
  (sticky), `Ctrl+Tab`. No tiene paleta ni `Ctrl+N`.

---

## Grupos y carpetas

Jerarquía de organización de un solo nivel de anidación: **grupo → carpeta → nota**.

### Grupos
- **Crear**: botón-icono `FolderPlus` (arriba a la derecha del `+` de nueva nota) → input de nombre debajo (nombre + color).
- **Renombrar / Eliminar / Color / View group / Archive**: menú contextual en la cabecera del grupo.
- **Aspecto ("índice con guías")**: cabecera **fija** al hacer scroll (y la de la carpeta justo
  debajo), sin cajas ni divisor: **pestaña** gris con la esquina plegada del color del grupo, nombre
  en caja normal, contador y un chevron que solo aparece al pasar el ratón o con el foco del teclado.
  Del pie de la pestaña baja una **guía** fina del color del grupo que recorre todo su contenido
  (carpetas incluidas); cada carpeta tiene su propia guía bajo su icono. Los títulos de las notas se
  alinean con el nombre de lo que las contiene (la sangría dice el nivel).
- **Nota abierta**: fondo neutro (sin tinte del grupo) y un **cursor** del color del grupo sobre la
  guía, a su altura, que **se desliza** al abrir otra nota (salta a la guía de la carpeta si está en
  una; se oculta si su carpeta está plegada). Si el grupo está **plegado**, su pestaña se tiñe y el
  título de la nota abierta aparece junto al nombre (`Personal · Diario`); una carpeta plegada que la
  contiene pinta su icono del color del grupo.
- **Colapsar / Expandir**: click en la cabecera, o Enter/Espacio con ella enfocada (estado persiste
  entre sesiones). Al plegar, la guía se recoge y las notas se desvanecen; al desplegar, la guía se
  dibuja y las notas entran escalonadas (sin animación con *reduce motion*).
- **Peek de grupo colapsado**: dejar el ratón ~400 ms sobre la cabecera de un grupo **colapsado** (con
  notas) abre a la derecha del sidebar una ventanita con sus notas en pequeño (título + fecha y, debajo,
  sus secciones como en el sidebar según *Sections in the sidebar*, en pequeño: línea plegada que se
  despliega al dejar el ratón encima y mapa abierto en la nota activa, o fila con scroll de celdas; la
  sección abierta de la nota activa va en sólido); las notas de sus **carpetas** van en la misma lista, después de
  las sueltas, con una etiqueta discreta (icono de carpeta + nombre). Altura ≈ 5 notas, con scroll.
  Arriba, un **buscador** ("Search in {grupo}…", admite `#sección`) que **recibe el foco** al abrirse:
  basta con empezar a escribir. ↑/↓ mueven la selección (la primera marcada por defecto), **Enter**
  abre la nota, **Esc** cierra y devuelve el foco donde estaba (p. ej. el editor, con su caret). Click en
  el título abre la nota y en una celda, esa sección (misma semántica que el sidebar, Ctrl/Cmd incluido);
  la nota activa va resaltada. **Abrir con click no la cierra**: la ventanita sigue abierta mientras el
  ratón esté encima (la nota recién abierta pasa a ser la activa) para poder abrir otra, y se cierra al
  sacarlo; Enter desde el buscador sí abre y cierra. Se cierra al sacar el ratón de cabecera+ventanita
  (con margen para cruzar el hueco), salvo si ya se tecleó en el buscador: entonces solo con click fuera,
  Esc o al abrir algo (un click en una nota vuelve a dejarla en modo hover: se cierra al salir).
  También al expandir el grupo, hacer scroll en el sidebar, cambiar de ventana o arrastrar. No aparece
  mientras se escribe en el editor con el ratón quieto encima, durante un drag, un rename o con un menú
  contextual abierto. Funciona igual con el sidebar fijado y flotante.
- **Ver el grupo**: click en **el nombre** del grupo (hover sutil sobre el texto), o "View group" en el
  menú contextual → abre la **vista de contenido** con ese grupo como lugar. Click en el resto de la
  cabecera = colapsar/expandir.
- **Archivar grupo**: menú contextual → "Archive group". Oculta el grupo **y todas sus notas** de
  la lista (las notas conservan su propio estado `archived`). Se revela con el mismo toggle
  **"Show archived"** del menú ⋯ del footer: los grupos archivados aparecen atenuados y al final. Para
  recuperarlo: "Unarchive group" en el menú contextual del grupo atenuado.
- **Asignar nota**: drag & drop, o menú contextual → "Add to group".
- Cada grupo tiene un color (pestaña, guías, cursor y marcas de arrastre; en **favorites**, una
  pestaña pequeña antes del título de cada favorita con grupo): los **8 colores del tema** o
  cualquier **color libre** (swatch con degradado al final de la paleta → selector nativo del SO).
- Las notas sin grupo aparecen al final, en "Sin grupo".

### Carpetas (subcarpetas dentro de un grupo)
- **Crear**: desde el submenú "Move to folder" → "+ New folder…" o el menú contextual del grupo
  ("New folder"; también en la columna de lugares de la vista de contenido, donde abre el campo tras las
  carpetas del grupo).
- **Mover nota a carpeta**: menú contextual de la nota → "Move to folder" (submenú con las
  carpetas del grupo). "Group root" la saca de la carpeta sin sacarla del grupo.
- **Renombrar / Cambiar icono / Eliminar**: menú contextual de la cabecera de carpeta (o de la carpeta
  en la columna de lugares de la vista de contenido). Al borrar una carpeta sus notas vuelven a la raíz
  del grupo.
- **Icono personalizado**: "Change icon" despliega dentro del menú una rejilla de iconos (trabajo,
  personal, casa, ideas, libro, código, calendario, viajes, música…, 27 en total; tooltip con su nombre)
  con "Default" primero (vuelve al icono de carpeta). El actual va marcado con un anillo; elegir uno lo
  aplica y cierra el menú. Se ve en el sidebar, la vista de contenido, el peek de grupo y las listas de
  "Move to folder". Se sincroniza con `folders.json`.
- **Colapsar / Expandir**: independiente de los grupos (estado persistido). El icono de carpeta por
  defecto abre su solapa cuando está expandida (los iconos personalizados no tienen solapa).
- **Reordenar carpetas**: arrastrar la cabecera de una carpeta (sidebar) o la carpeta en la columna de
  lugares de la vista de contenido y soltarla sobre otra carpeta **del mismo grupo**; una línea marca si
  queda antes o después (en el sidebar cuenta todo el bloque de la carpeta, con sus notas). El orden es el
  campo `order` de `folders.json` (se sincroniza) y lo siguen el sidebar, la vista de contenido y el peek.
  No mueve carpetas entre grupos.

> Grupos y carpetas se guardan en `groups.json` / `folders.json` dentro del dir de notas y **se
> sincronizan con GitHub** (no en `settings.json`).

---

## Vista de contenido (todo el contenido y cada grupo)

Una sola vista amplia que **sustituye el área del editor** (el sidebar sigue visible) para recorrer el
contenido por **lugares**: todo, favoritas, cada grupo, cada carpeta o las notas sin grupo. Sustituye a
las antiguas vista de grupo y "All content".

**Cómo entrar:**
- Botón-icono **"View all content"** (`LayoutGrid`) de la fila del buscador del sidebar → lugar *All*.
- Click en el **nombre de un grupo** (sidebar, cerebro) o **"View group"** en su menú contextual → ese
  grupo como lugar.
- Al entrar **no hay ninguna nota elegida**: ninguna fila desplegada y la vista previa cerrada (la lista
  ocupa el ancho). Elegir una nota (clic o teclado) la despliega y abre la vista previa.

**Cómo salir:** `Esc` (cuando ya no queda nada que cerrar, ver Teclado), abrir una nota en el editor
(doble clic, `Intro` o "Open in the editor"), crear una nota, o seleccionar cualquier nota en el sidebar.

**Cabecera:** icono del lugar (pestaña grande del grupo con su esquina plegada de color; rejilla para
*All*; estrella para *Favorites*), la ruta si es carpeta ("Trabajo /"), el nombre y el resumen
`N notes · M folders · last edited X`. A la derecha: **buscador** local ("Search note or section", admite
`#sección`; no toca la búsqueda del sidebar; `Esc` lo vacía y `↓` baja a la lista), el **selector de
orden** de la lista (control segmentado pequeño **"By date"** / **"In order"** (ES "Por fecha" / "En orden"), ver
Columna 2; se recuerda al cerrar la vista y entre sesiones), **"+ Note"** (crea la
nota en el grupo/carpeta del lugar; en *All*, *Favorites* y *Ungrouped*, sin grupo) y **⋯** con el
interruptor **"Show archived"** (de la vista, apagado al abrir): con él se listan también las notas
archivadas (icono de archivo, algo atenuadas) y los grupos archivados en la columna de lugares.

**Columnas redimensionables:** un tirador vertical entre lugares y notas y otro entre notas y vista
previa (este solo con la vista previa abierta); se arrastran para cambiar el ancho y **doble clic**
vuelve al ancho por defecto. Lugares: 180–360 px (260 por defecto). Vista previa: desde 280 px hasta 1200 px
o el 70 % de la vista, dejando siempre sitio a la lista (por defecto, un ancho que sigue al de la ventana;
en una vista muy estrecha, la mitad aunque sea menos de 280). La lista de notas conserva unos 320 px: si falta sitio cede primero la
vista previa hasta su mínimo y luego la columna de lugares hasta 180; solo si aun así no cabe, encoge la
lista. Al volver a ensanchar la ventana cada columna recupera su ancho. Los anchos se recuerdan entre
sesiones.

**Columna 1 · Lugares:** *All*, *Favorites*, la etiqueta "Places", cada grupo (pestaña + nombre +
contador) con sus carpetas debajo, sangradas bajo la guía vertical del color del grupo (que baja hasta
la última carpeta; un grupo sin carpetas no la pinta), **"+ Group"** y al final *Ungrouped*. El lugar
elegido lleva fondo neutro y una barra de 3 px de su color a la izquierda.
- **"+ Group"** (más apagado que los lugares) y **"New folder"** del menú contextual del grupo (no hay
  botón "+ Folder" visible) abren un campo en la columna (el de carpeta, tras las carpetas del grupo);
  `Intro` (o salir con texto) crea y abre el lugar nuevo; `Esc` o salir vacío cancela.
- **Clic derecho** en un grupo o una carpeta → **el mismo menú que en el sidebar** (sin "View group",
  porque ya estás en la vista): new note / new folder, rename, color (8 del tema + color libre), archive y
  delete en grupos; new note, rename y delete en carpetas. **Rename** edita en la propia columna (`Intro`
  guarda, `Esc` cancela). Si borras el lugar en el que estás, la vista pasa a *All*.
- **Arrastrar** una nota (o la selección múltiple) desde la lista hasta un grupo, una carpeta o
  *Ungrouped* la mueve; el destino se resalta. También acepta notas arrastradas desde el sidebar.
- **Arrastrar una carpeta** sobre otra del mismo grupo las **reordena** (línea antes/después; mismo orden
  que el sidebar). Mientras se arrastra una carpeta, los lugares no son destino de notas.

**Columna 2 · Notas:** las del lugar, en uno de dos órdenes (selector de la cabecera):
- **By date** (por defecto): de la más reciente a la más antigua, en bloques con cabecera fija y
  contador: **Today**, **Yesterday**, **This week**, **Last 30 days**, **Earlier**.
- **In order** ("En orden"): el mismo orden y agrupación que el sidebar (incluido el orden manual por
  arrastre). En un **grupo**: primero sus notas sueltas y luego cada carpeta con su cabecera fija (icono +
  nombre + contador). En una **carpeta**, *Favorites* o *Ungrouped*: sus notas en el orden del sidebar,
  sin cabeceras. En **All**: una cabecera por grupo (pestaña del color + nombre + contador), las carpetas
  como subcabeceras más pequeñas y sangradas que se quedan fijas bajo la del grupo, y al final
  **Ungrouped**; los grupos archivados solo con "Show archived". La hora muestra la fecha del item del
  sidebar (`14:32`, "Yesterday", `Oct 28`) y la ruta no repite lo que dicen las cabeceras. Las cabeceras
  que una búsqueda deja vacías desaparecen. Las flechas y `Mayús+clic` siguen el orden que se ve. **Reordenar**: arrastrar una nota (una sola, no la selección múltiple) y soltarla
  entre las notas de **su mismo contexto** (sueltas del grupo, una carpeta, *Ungrouped*, o *Favorites*
  en ese lugar); una línea marca el hueco. Escribe el mismo orden manual que el sidebar
  (`note-order.json`), así que el sidebar cambia a la vez. El pie añade "or between notes to reorder them".
- Cada fila: la hora a la izquierda (por fecha: `HH:mm` hoy y ayer, día de la semana esta semana, `d MMM` antes),
  el título (candado si está cifrada) y debajo la ruta, sin lo que ya dice el lugar (en *All* /
  *Favorites* / *Ungrouped*: pestaña + "Grupo / Carpeta"; en un grupo: la carpeta o "In the group"; en
  una carpeta: nada). A la derecha del título, la línea de colores de las secciones del sidebar, **solo
  decorativa** (no engorda ni despliega); el título manda: con uno largo la línea se encoge y
  desaparece antes de que el título se corte con "…". Cada fila es una tarjeta con un fondo un punto
  más marcado que el de la columna (separadas entre sí); la elegida, más marcada aún.
- **Acordeón:** las filas van limpias; **solo la nota elegida se despliega** y muestra bajo su título
  sus secciones **una debajo de otra** (celdas del mapa del sidebar a todo el ancho, con el nombre a la
  izquierda, el recuento de palabras a la derecha y la esquina doblada de su color), tras una guía fina
  del color del grupo. Clic en la fila → la nota con su primera sección (y se despliega); clic en una
  celda → esa sección (se rellena de su color) en la vista previa; **doble clic** o `Intro` → abre en el
  editor; clic derecho → menú de la nota o de la sección; hover en una celda → previsualización
  flotante. Al hacer clic en otra nota, la que estaba desplegada se pliega sin mover la fila clicada.
  Con búsqueda, en la nota desplegada las celdas que coinciden se tiñen y el resto se atenúa.
- **Selección múltiple:** casilla en la columna de la hora al pasar el ratón (siempre visible mientras
  haya selección); `Ctrl/Cmd+clic` alterna, `Mayús+clic` marca el rango visible, `Ctrl/Cmd+A` marca
  todas las visibles, y con algo marcado basta un clic. Barra flotante al pie de la lista: contador,
  **Favorite/Unfavorite**, **Archive/Unarchive** (toggle), **Move to group** (o "No group"), **Move to
  folder** (solo con un grupo o carpeta como lugar), **Delete** (con confirmación) y ✕. Cambiar de lugar
  limpia la selección.
- Al cambiar de lugar o de orden, la nota elegida se mantiene si sigue en la lista; si no (o si una
  búsqueda o un borrado la saca), **no queda ninguna elegida** y la vista previa se cierra: nunca salta
  sola a otra nota.

**Columna 3 · Vista previa** (se anima al abrir y cerrar): ruta (pestaña + Grupo / Carpeta / Nota),
nombre de la sección con su cuadradito de color, `Section n of m · X words · edited …` (la hora de la
**última edición de esa sección** —contenido o nombre—; en secciones anteriores a esta función, notas
vinculadas o editadas desde el móvil, la de la nota) y el **contenido
real** de la sección en solo lectura (mismo render que el editor, con su fuente; en modo texto, tal
cual). Notas cifradas bloqueadas: aviso "This note is encrypted". Botón **"Open in the editor"**
(`Intro`). La **X** la cierra y la lista gana el ancho; no se reabre sola hasta que eliges otra sección
o nota.

**Teclado** (con el foco en la lista, que lo recibe al abrir): `↑ ↓` nota, `← →` sección, `Intro` abre
en el editor. Sin nota elegida, `↓` elige la primera y `↑` la última (`← →` e `Intro` no hacen nada). `Esc`, por orden: cierra el menú ⋯, limpia la selección múltiple, cierra la vista previa
y, si no queda nada, cierra la vista. Un pie recuerda los atajos. Con ratón, la **✕** a la derecha del
⋯ de la cabecera ("Close the view (Esc)") sale de la vista directamente.

**Volver desde la vista de nota:** si abres la vista de nota desde aquí (clic derecho en una sección →
"Note overview"), su botón de cerrar/`Esc` te devuelve a la vista de contenido en el mismo lugar.

---

## Vista de nota (note overview)

Vista amplia que **sustituye el área del editor** para ver de un vistazo **todas las secciones de
una nota**. Es el **mapa de secciones del editor con la vista previa dentro**: las secciones son
celdas de un mismo bloque reticulado (juntas finas, esquinas exteriores redondeadas, sin bordes ni
sombras), en el **orden de las pestañas**, cada una con su contenido real legible. El sidebar
permanece visible como contexto. Pensada para saltar rápido a una sección, repasar la estructura de
una nota con muchas secciones o reorganizarla. Es una de las vistas full-area mutuamente excluyentes
(contenido / nota / cerebro): abrir una cierra las otras, y seleccionar cualquier nota vuelve al editor.

**Cómo entrar:**
- Botón **⊞** (icono de cuadrícula) de las acciones del mapa de secciones del editor, justo **al lado
  de la estrella de favoritos**.
- **Click derecho** sobre una **nota** o un **tag de sección** (sidebar / vistas), o sobre un **tab
  del editor** → **"Note overview"** (no en una ventana de sección ni si la vista de esa nota ya está
  abierta).
- **Pulsar la nota en el sidebar** (o en el peek de un grupo, o `Intro` sobre un resultado de
  búsqueda), solo si Settings → Editor → **Clicking a note opens** está en `Note overview` y la nota
  tiene **más de una sección**. Por defecto (`Editor`) pulsar la nota va al editor, a la primera
  sección. Abierta así, la nota queda activa: salir de la vista vuelve a su editor.

**Cómo salir:** `Esc` (si no hay selección), el botón **⊞ activo** de la cabecera (resaltado en el
color de acento: "estás en la vista de nota"; vuelve al editor, o a la vista de contenido —en el mismo
lugar— si veniste de ahí),
o click en una tarjeta (abre esa sección en el editor).

**Cabecera** (en el mismo plano que el contenido, sin banda): candado si está cifrada + **título de la
nota editable inline** (click o lápiz al hacer hover → input; commit en blur/Enter, `Esc` revierte; no
editable si está bloqueada) + `N sections · edited <fecha>` + **"Select all" / "Deselect all"** (solo si
hay secciones) + separador + **⊞ activo** + **estrella** de favorito + **`⋯`** = el **menú de la nota**
(el mismo del click derecho en el sidebar) con además **Rename note** arriba; **Delete note** vive ahí
(con confirmación).

**Rejilla:**
- **Columnas adaptativas**: tantas de ≥ 220 px como quepan (mínimo 1). Filas **justificadas** de alto
  fijo: todas llegan al mismo borde; una tarjeta que no cabe cierra la fila y las de esa fila se estiran.
- La sección **abierta en el editor** (si la nota está en algún panel) ocupa **dos columnas** (si hay
  más de dos), con la cabecera en su **color sólido** y la etiqueta **OPEN**.
- **Mosaico**: las tarjetas no son todas el mismo cuadrado. Las secciones con **mucho contenido** (unas
  12 líneas o más) ocupan **columna y media** —un rectángulo, siempre más estrecho que la abierta—; el
  resto son cuadradas. Si una ancha no cabe en la fila entra como cuadrada (no deja huecos). Con una o
  dos columnas todas miden lo mismo.
- El hueco final de la última fila es la celda **"New section"** (crea una sección y te lleva al editor
  en ella); si la última fila está llena (o le queda menos de una columna), aparece como una franja fina debajo. Ya no hay botón "Add
  section" en la cabecera.

**Tarjeta de sección:**
- **Cabecera** con el nombre (en color de texto, una línea) sobre una **franja neutra algo más clara**
  que la tarjeta, para que el nombre se lea como el título; la sección abierta la tiene en color
  sólido. El color de la sección lo pone la **esquina doblada** (como en el mapa, pero más grande; crece
  en hover). Oculta a la IA → icono de ojo tachado, celda y franja más tenues, esquina gris y nombre
  atenuado. El contenido deja un pequeño margen bajo la cabecera.
- **Vista previa** del contenido real a tamaño legible (títulos, listas, tareas con casilla — hechas
  tachadas —, código en mono), que se desvanece abajo, **con la fuente del editor** (Settings → Editor:
  Inter o mono); las secciones en modo texto muestran el texto tal cual, también con esa fuente (como el
  textarea del modo texto); las vacías, "Empty section · click to write".
- **Pie**: progreso de tareas (`2/6 tasks`) si tiene 3 o más, si no el número de palabras ("Empty" si
  no hay nada); a la derecha las marcas **Text** (modo texto) y **Hidden from AI**.

**Interacciones:**
- **Clic** → abre la sección en el editor (cierra la vista).
- **Doble clic en el nombre** → **renombrar en línea** (campo con el aro del color de la sección; Enter
  o perder el foco guarda, Esc cancela). Un clic simple sobre el nombre espera un instante antes de
  abrir, para dejar sitio al doble clic.
- **Arrastrar** una tarjeta → **reordena las secciones** (el mismo orden que las pestañas del editor):
  deja su hueco y la junta de destino se ilumina con la barra de acento, igual que en el mapa. Soltarla
  sobre la celda "New section" la lleva al final.
- **Click derecho** → el menú de sección de siempre (color, IA, abrir en paralelo, duplicar, borrar…).
- **Selección múltiple**: la **casilla** de la cabecera (junto a la esquina) aparece al pasar el ratón (y queda visible en
  todas mientras haya selección); **Ctrl/Cmd+clic** togglea, **Mayús+clic** selecciona el rango, y con
  algo seleccionado basta un clic. "Select all" (o `Ctrl/Cmd+A`) marca todas; si ya lo están, las
  desmarca. Las seleccionadas llevan un aro de acento. Con ≥1 marcada aparece una **barra flotante**
  abajo (también reticulada): contador, **Hide from AI / Show to AI** (oculta o vuelve a indexar para la
  IA; solo en notas no cifradas), **Text mode / Markdown mode** (cambia de golpe el modo de todas las
  seleccionadas; nunca toca el contenido), **Delete** (con confirmación; deshabilitado si están todas,
  para no dejar la nota vacía) y **✕** para limpiar.
- **Teclado**: `← → ↑ ↓` mueven el foco entre tarjetas, `Intro` abre, `F2` renombra, `Esc` limpia la
  selección y, si no hay, vuelve al editor.
- Notas **cifradas y bloqueadas** muestran un estado "encrypted" (sin rejilla) hasta desbloquear en el
  editor.

---

## Secciones dentro de una nota

Cada nota puede tener múltiples secciones independientes. Sus pestañas forman un **mapa de
secciones**: un único bloque de celdas que, cuando no caben en una fila, **baja de fila** como los
salientes de un archivador (sin scroll horizontal):

```
╭─────────┬──────────────────┬───────────────────┬────────╮
│ Note   ◥│ Tasks this week ◥│ ▓Questions▓▓▓▓▓ ⌄ │ Ideas ◥│   │ [⊞] [⭐] [⋯]
├─────────┴──┬───────────────┼────────┬──────────┴──┬─────┤
│ Meeting   ◥│ Backlog      ◥│ +3 more│      +      │
╰────────────┴───────────────┴────────┴─────────────╯
```

- **Cómo se ve:** celdas de 28 px separadas por juntas finas (se ve el fondo del editor), solo las
  esquinas exteriores del bloque redondeadas. Cada fila se reparte para llenar el ancho. La pestaña
  **activa** va en **sólido** con el color de su sección, en negrita, con el título (hasta ~340 px) y un
  **chevron `⌄`** a la derecha que abre el menú de la sección (el mismo del click derecho). Las
  inactivas son neutras con una **"esquina doblada"** (triangulito arriba a la derecha) del color de
  su sección, que crece al pasar el ratón; su título se corta con `…` si no cabe. El color del texto
  de la activa se elige solo para que se lea bien en cualquier tema (claro u oscuro). Al cambiar de
  pestaña, la fila se reparte con una animación suave (sin animación si el sistema pide reducir el
  movimiento).
- **Tope de 3 filas:** con muchas secciones, las que no caben en tres filas se agrupan en una celda
  **`+N more`**; al pulsarla se despliega el mapa entero y aparece **`Show less`** al final para
  volver a plegarlo (se pliega solo al cambiar de nota). La sección activa **nunca queda oculta**: si
  estaba entre las plegadas, se muestra en el último hueco visible (sin cambiar el orden real).
- Las acciones de la nota quedan a la derecha del mapa, alineadas con su primera fila:

(`⊞` = note overview · `⭐` = favorito · `⋯` = menú de sección: modo texto/markdown, copiar,
**guardar como plantilla**, **exportar nota**, sticky, **ocultar a la IA**, archivar, cifrar, borrar nota.
"Make permanent" ya no está aquí: vive en el mini menú junto a `Deletes …` de las temporales)

- **Exportar nota** (`Export note…`, icono `Share`): abre el popup de exportación (el mismo de
  Ajustes / paleta, evento `noteflow:open-export`) con **esa nota ya preseleccionada** — con
  `detail: { noteId }` el popup preselecciona esa nota en vez de la activa, y la lista aunque esté
  archivada. También en el menú contextual de nota (right-click en el sidebar). Oculto si la nota está
  cifrada y bloqueada.

- **Agregar**: `Ctrl+T` o la celda `+` (la última del mapa).
- **Renombrar**: doble-click en el tab, o `Rename section` en su click derecho / chevron → el tab se
  convierte en un input inline (teñido con el color de la sección): Enter (o perder el foco) guarda, Esc cancela; ambos devuelven el foco al editor.
  Mientras se escribe, los atajos de la app (`Ctrl+T/W/M/F/S/G`, `Ctrl+Tab`…) no se disparan.
- **Click derecho en un tab** → el **menú contextual de sección** junto al cursor (el mismo
  `NoteContextMenu` que el click derecho sobre un tag de sección en el sidebar / vistas; ver
  "Menú contextual" más abajo), con además **Rename section**. Duplicar y borrar actúan sobre el
  editor: la copia queda activa en ese panel y el borrado ofrece **Undo**. Se cierra con click fuera o
  Esc; al cerrarlo sin que nada se lleve el foco, el foco vuelve al editor. En una ventana de sección
  se ocultan `Note overview` y `Open alongside`.
- **Duplicar**: `Duplicate section` (click derecho en el tab o en un tag de sección)
  crea una copia con id nuevo, mismo contenido, mismo modo (texto/markdown) y mismo flag "oculta a la IA",
  llamada `"<nombre> (copy)"` / `"<nombre> (copia)"` según el idioma de la UI, **justo a la derecha** de
  la original, y la deja activa (`notesStore.duplicateSection`). No se ofrece con la nota cifrada y
  bloqueada.
- **Reordenar**: drag & drop los tabs. La pestaña arrastrada deja su hueco y una barra del color de
  acento marca en qué junta caerá. Si el mapa estaba plegado (`+N more`), se despliega al empezar a
  arrastrar para poder soltar en cualquier sitio; tras soltar se queda desplegado (si cancelas el
  arrastre, se vuelve a plegar).
- **Eliminar**: `Ctrl+W` o `Delete section` en el menú de la sección (click derecho o chevron); no se
  puede si es la única sección.
- **Navegar**: `Ctrl+Tab` / `Ctrl+Shift+Tab` (siguiente / anterior).
- **Sticky**: `Open as sticky note` (menú `⋯` o menú de la sección) abre la sección en ventana flotante.
- **Color de sección**: desde el menú contextual de sección (tab del editor o tag de sección) se puede
  asignar un color a una sección por su nombre: los 8 del tema o un **color libre** (swatch con
  degradado → selector nativo del SO); "Auto" vuelve al color por nombre. Se aplica a los tags de
  sección en el sidebar y a las pestañas del editor. Se guarda en `section-colors.json` (sincronizado).
- **Ocultar a la IA** (`Hide from AI`): marca una sección como invisible para la IA. Una sección
  oculta **nunca** se indexa ni aparece en el chat, en "Related notes", en el grafo del cerebro ni en
  las tools del agente — la IA actúa como si no existiera (el resto de la app la trata con normalidad).
  Disponible en el **menú `⋯` del editor** (sección activa) y en el **click derecho sobre un tag de
  sección** (sidebar, vista de contenido y tarjetas de la vista de nota). Las secciones ocultas muestran
  un icono `EyeOff` (pestaña del editor, tags del sidebar, cabecera y pie de la tarjeta en la vista de nota); `Show to AI` lo
  revierte (re-indexa la sección). Útil para datos sensibles o ruido que no quieres que el modelo use.

Las secciones aparecen como pequeños tags en la tarjeta de la nota y son clickeables para
navegar directamente a esa sección.

> **Dos menús contextuales (mismo componente `NoteContextMenu`, distinto contenido según el
> objetivo):** el click derecho **sobre la nota** (en zona sin sección) muestra las acciones de
> nivel-nota (favorito, duplicar, exportar, archivar, mover a grupo/carpeta, sticky, abrir en paralelo,
> abrir en ventana nueva, borrar nota); el click derecho **sobre un tag de sección** (o sobre un **tab
> del editor**) muestra solo lo propio de la sección (abrir la sección en paralelo, color de sección,
> ocultar a la IA, abrir como sticky, abrir en ventana nueva) más unas pocas comunes (note overview,
> y **borrar sección** — o borrar nota si es la única sección). El componente
> distingue por el campo `sectionId` del request (`null` = nota).

---

## Previsualización de sección al hover

Cualquier elemento que **navega a una sección concreta** muestra, al pasar el ratón, una
**tarjeta flotante con una previsualización** de esa sección — con el mismo aspecto que una tarjeta
de la [vista de nota](#vista-de-nota-note-overview) pero apaisada (más ancha que alta, siempre del
mismo tamaño): cabecera con el **nombre de la sección en su color** y, a la derecha, el **título de la
nota** atenuado; la esquina doblada del color; el contenido real a tamaño de lectura con la fuente del
editor, recortado con fade; y el pie con palabras/tareas y las marcas "Text" / "Hidden from AI".
Permite ojear el contenido sin navegar.

**Dónde aparece:**
- **Sidebar** → celdas de sección de cada nota (mapa abierto, despliegue flotante, búsqueda o fila
  con scroll), salvo la sección abierta.
- **Vista de contenido** → celdas de sección de cada nota; **peek de grupo colapsado** → sus celdas.
- **Editor** → pestañas de sección (excepto la sección activa, que ya estás viendo).
- **Paneles de IA** (Related / Chat) → resultados que apuntan a una sección.

**Comportamiento:**
- Aparece tras un breve retardo (~380 ms) para no parpadear al barrer varias pestañas, con una
  entrada sutil (fundido + desliza unos px de izquierda a derecha, ~140 ms; solo fundido con
  "reducir movimiento" del sistema).
- **Posición:** en sidebar/grupos/editor cuelga con su esquina superior izquierda **junto al
  cursor** (hacia abajo-derecha), para no tapar el contenido a la derecha del ratón; en los
  paneles de IA sale al lado del elemento. Se voltea/recoloca si no cabe en pantalla.
- Se cierra al **quitar el ratón** o con **cualquier click**.
- Secciones **vacías** muestran "Empty section · click to write"; secciones de notas **cifradas y bloqueadas** no
  se previsualizan (no hay contenido en memoria).
- Las **imágenes pegadas** se ven como miniatura (alto máx. 120 px, respetando el ancho al que se
  redimensionaron), igual que en las celdas de la vista de nota; nunca su base64. En secciones en
  modo texto se ven como `![alt]([image])`, como en el propio textarea.

> En la **vista cerebro** la interacción es distinta (click en vez de hover): ver esa sección.

---

## Editor de contenido

### Dos modos de sección (solo hay dos)

Terminología de UI (EN/ES): **Markdown mode / Modo markdown** y **Text mode / Modo texto**. No usar
"raw", "crudo", "rich text", "enriquecido" ni "WYSIWYG" en textos de usuario.

**Modo markdown** (`isRawMode: false`, por defecto en la app) — el editor (TipTap) **renderiza** el
markdown: títulos, listas, checkboxes, tablas… con toolbar.
**Modo texto** (`isRawMode: true`; en el CLI, con `--raw` — desde v2.5.0 el CLI crea en Modo markdown por defecto) — textarea plana: el contenido se ve **tal cual**,
sin renderizar (un `# Título` se ve con la almohadilla).

En ambos modos el `.md` de la sección guarda markdown (el editor serializa con `htmlToMarkdown`).

- Alternar con `Ctrl+M` (o el icono Eye/Edit en la toolbar).
- Undo/Redo con `Ctrl+Z` / `Ctrl+Y` (o `Ctrl+Shift+Z`). Cada sección tiene **su propio historial**, que
  se conserva al cambiar de sección, de nota o de vista y volver (hasta ~30 secciones recientes); se
  descarta si la sección cambió por fuera mientras tanto (sync, CLI, IA, otra ventana) y al bloquear o
  cifrar la nota.

### Formatos soportados
| Elemento | Markdown | Atajo |
|---|---|---|
| Negrita | `**texto**` | Ctrl+B |
| Cursiva | `*texto*` | Ctrl+I |
| Subrayado | `++texto++` (formato en disco; escribirlo no lo convierte al vuelo) | Ctrl+U |
| Tachado | `~~texto~~` | — |
| Resaltado | `==texto==` | Toolbar |
| Código inline | `` `code` `` | Ctrl+E |
| Bloque de código | ` ```lang ` | Ctrl+Shift+B |
| Heading H1–H3 | `#`, `##`, `###` | Toolbar |
| Lista viñetas | `- item` | Toolbar |
| Lista numerada | `1. item` | Toolbar |
| Lista de tareas | `- [ ] tarea` | Toolbar |
| Tablero kanban | `<!-- kanban -->` … `<!-- /kanban -->` | `/kanban` · Toolbar |
| Cita / Blockquote | `> texto` | Toolbar |
| Tabla | Pipe-table GFM (`\| a \| b \|` + `\|---\|---\|`) | `/table` · Toolbar (selector de tamaño; menú contextual para filas/columnas) |
| Link | `[texto](url)` | Toolbar |
| Imagen | `![alt](src)` | Drag & drop / Paste |
| Separador | `---` | — |

### Listas (comportamiento al editar y al guardar)
- Tareas, viñetas y numeradas seguidas son **listas distintas** (no se mezclan en una); entre ellas
  no aparece ninguna línea en blanco fantasma al reabrir.
- Un ítem solo contiene **su texto y sublistas** (lo que markdown sabe guardar): un bloque de
  código, heading, cita, tabla o separador insertado o pegado en un ítem se coloca fuera de la lista,
  partiéndola; `> `, ```` ``` ```` o `# ` escritos en la 2ª línea de un ítem quedan como texto. Por lo
  mismo, dentro de un ítem el botón **Cita** no hace nada, y **Heading** / **Bloque de código** de la
  toolbar sacan la línea fuera de la lista.
- En un **heading**, Shift+Enter lo parte como Enter (un heading markdown es una sola línea).
- **Backspace** al inicio de un ítem lo une al anterior como segunda línea; si el anterior tiene
  subítems, lo anida **detrás** de ellos (antes su texto acababa encima de los subítems al reabrir).
- Limitación del formato: una **línea en blanco** dentro de un ítem o párrafo (dos Shift+Enter
  seguidos con texto detrás) se guarda igual que dos bloques y al reabrir se parte en dos.
  Detalle y lista completa de ambigüedades en `.agents/context/patterns.md`.

### Autocierre de paréntesis (modo markdown)
- Escribir `(` inserta `()` con el cursor en medio; con texto seleccionado (en un mismo párrafo)
  lo envuelve: `(texto)`, manteniendo la selección.
- No autocierra si justo a la derecha hay una letra o un dígito (escribir delante de una palabra).
- Escribir `)` delante de un `)` autoinsertado lo salta en vez de duplicarlo; Backspace en un par
  vacío autoinsertado `(|)` borra los dos. Los `)` escritos a mano no se saltan ni se borran.
- Funciona también en bloques de código y código inline. Un solo `Ctrl+Z` deshace el par.

### Autocompletado con IA (modo markdown, Beta)
- **Solo con plan NoteFlow AI** (da igual qué proveedor use el chat) y **apagado por defecto**. Se
  activa en **Ajustes → IA → "Your notes and AI" → Autocomplete** (etiqueta "Beta"); sin plan el
  interruptor sale deshabilitado con "Requires an active NoteFlow AI plan". Es un ajuste **de este
  dispositivo** (no se sincroniza): al activarlo, mientras escribes se envía el texto cercano al
  cursor a NoteFlow AI. Activarlo o desactivarlo aplica al momento, sin recargar.
- Tras una pausa breve al teclear (~0,4 s) con el cursor al **final de un párrafo** (también dentro
  de un ítem de lista), aparece una continuación corta (hasta ~12 palabras) como **texto fantasma**
  atenuado, que se va pintando según llega.
- **Tab** la acepta (un solo `Ctrl+Z` la deshace); **Esc** la descarta; cualquier otra edición o
  mover el cursor también la descarta. Si tecleas justo lo que la sugerencia empieza diciendo, se
  conserva el resto. Tras aceptar con Tab no llega otra sugerencia hasta que vuelves a teclear.
- Sin sugerencia visible, Tab hace lo de siempre en listas, tareas, tablas y bloques de código
  (sangrar, saltar de celda…). Con el autocompletado activo, **Tab no sale del editor desde un
  párrafo** (normal o dentro de una cita): no hace nada, así no se escribe fuera al pulsarlo cuando
  la sugerencia acaba de desaparecer. **Shift+Tab sí** sale, como siempre. Con el autocompletado
  apagado, Tab se comporta como siempre.
- Limitación conocida: si una sugerencia empezara de verdad por `+` o `_`, ese primer carácter
  puede perderse (se usa internamente como marcador de "pegado a la palabra" / "palabra nueva").
- **Nunca** se usa en notas cifradas, secciones ocultas a la IA ("Hide from AI"), notas vinculadas,
  bloques de código, tablas, con texto seleccionado, con el menú `/` abierto, en modo texto, ni con
  menos de ~20 caracteres escritos.
- El autocompletado gasta de la asignación mensual de NoteFlow AI, con un **techo propio (30 %)**:
  con el interruptor activo, la fila muestra una barra con el porcentaje de ese techo usado este
  mes. Al agotarlo (o al agotar la asignación total) las sugerencias dejan de aparecer, sin avisos
  en el editor.

### Tareas con deadline, alarma e importancia
Los items de lista de tareas (`- [ ]`) tienen soporte extendido:
- **Deadline**: fecha límite (se muestra junto al checkbox).
- **Alarm**: notificación nativa del sistema en ese momento (el proceso principal la dispara,
  funciona aunque la ventana esté oculta; incluye las ya vencidas al registrar).
- **Importancia/prioridad**: grado Low / Medium / High. Queda visible como un **punto de color**
  sin texto (Low → verde, Medium → amarillo, High → rojo), para que ocupe poco. Persiste en markdown
  con el marcador ` 🔺{level}` (low|medium|high), tras `📅`/`⏰`.
- **Un solo botón por tarea** a la derecha del texto: sin valores es un icono de calendario-reloj
  que aparece en hover; con valores muestra **siempre** sus chips (punto de importancia + badge
  `📅 fecha ⏰hora`), y clicar en ellos abre el mismo menú. El botón alterna el menú (abrir/cerrar).
- **Menú de tarea** (popover pequeño; importancia, atajos y "Clear" se aplican **en vivo** y los
  chips se actualizan detrás; los campos de fecha y hora se guardan al salir del campo, con `Enter` o
  al cerrar el menú —también si se cierra volviendo a pulsar el botón—, nunca a medio teclear; lo
  elegido en el calendario nativo se guarda al momento):
  - **Importance**: fila segmentada `⊘ · Low · Medium · High`; la opción elegida toma su color.
    `←/→` la recorren (y la eligen); al abrir, el foco está en la opción actual.
  - **Deadline**: atajos **Today / Tomorrow / Next week** (el lunes siguiente) con el día que
    representan a la derecha (resaltado si es el deadline actual), y debajo los campos **fecha** y
    **alarma** (hora; deshabilitada hasta que hay fecha, con `×` para quitarla). Clicar el icono de cada campo
    abre el selector nativo. "Clear" junto al título quita deadline + alarma (cambiar la fecha
    conserva la alarma).
  - Pie: **Clear all** (quita todo; solo si hay algo) y **Done**. `Esc`, `Enter` en un campo o
    *Done* cierran y devuelven el foco al texto; un clic fuera cierra sin moverlo. `Tab` no sale del
    menú. Se coloca alineado a la derecha del botón, debajo (o encima si no cabe) y nunca se sale de
    la ventana (en un sticky pequeño hace scroll, la importancia queda en solo puntos y fecha/alarma
    se apilan); sigue al botón si se hace scroll.
- Las **tarjetas kanban** mantienen sus dos triggers propios (fecha y bandera) con pickers separados.
- **Reordenar arrastrando:** en hover aparece un asa **⋮⋮** a la izquierda de la casilla (en el
  margen, sin desplazar el texto; también en stickies y en Readable). Se arrastra desde el asa (no
  desde el texto) como una tarjeta del kanban: copia flotante, la tarea original atenuada y una
  línea de acento donde caerá; cerca del borde el editor hace scroll; `Esc` cancela. La tarea viaja
  **con sus subtareas** y puede soltarse entre cualquier par de tareas, a cualquier nivel, también
  en otra lista de tareas de la sección (en la mitad inferior de una tarea con subtareas → primera
  subtarea; tras la última de una sublista con el puntero más a la izquierda → sale al nivel del
  padre). Nunca dentro de una lista de viñetas/numerada ni dentro de sí misma. Un `Ctrl+Z` deshace.
- **`Alt+↑` / `Alt+↓`** (⌥ en macOS) mueven el ítem donde está el cursor (tarea, viñeta o numerado,
  con sus subítems) por encima/debajo de su hermano.
- **Tareas marcadas al final** (Settings → Editor → *Move checked items to the bottom*, desactivado
  por defecto, sincronizado): al marcar una tarea con la casilla, se ve el check un instante y baja
  deslizándose al final de su lista (una subtarea, dentro de su sublista; un padre, con sus hijos).
  Al desmarcarla vuelve justo encima de las marcadas. Un `Ctrl+Z` deshace marcado + movimiento. No
  reordena listas al abrir la nota. Sin animación con "reducir movimiento" del sistema. A mano: menú
  `/` → **Move checked to bottom** dentro de cualquier lista de tareas (también en notas vinculadas).
- En **modo texto** nada de esto aplica (el markdown se edita tal cual).

### Tablas
- **Botón de tabla de la toolbar:** fuera de una tabla (tooltip *Insert table*) abre el **selector de
  tamaño**; con el cursor o una selección **dentro de una tabla** (tooltip *Table options*, botón
  resaltado) abre el **menú de la tabla** sobre la celda activa, bajo el botón (el mismo del clic
  derecho, con *Delete table*). Pulsarlo otra vez cierra lo abierto. Selector de tamaño: rejilla 8×8 donde el ratón resalta
  filas × columnas y el clic inserta; con teclado, flechas mueven la selección, `Enter` inserta y `Esc`
  cierra devolviendo el foco al editor. La etiqueta muestra `filas × columnas` (p. ej. `3 × 4`) y las
  **filas incluyen la de cabecera** (3 × 4 = cabecera + 2 filas, 4 columnas). Arranca en 3 × 3. Se
  puede elegir **una sola columna** (1 × 1 incluido); una tabla que se queda en una columna al borrar
  columnas sigue siendo tabla al reabrir la nota.
- **`/table`** (o `/tabla`, `/grid`, en cualquier idioma) inserta una tabla 3×3 con cabecera. También
  en notas vinculadas (una pipe-table es markdown estándar). **No se ofrece** dentro de una lista ni
  dentro de otra tabla (markdown no puede guardar ahí una tabla).
- **Dónde cae la tabla nueva:** en el cursor (sustituye un párrafo vacío o parte el párrafo). Si el
  cursor está en una **lista** o en una **tabla**, el botón la inserta **justo después** de la lista /
  tabla más externa (nunca anidada); dentro de una cita se queda en la cita. Con un tablero kanban
  seleccionado, va detrás del tablero en vez de sustituirlo.
- Siempre con **fila de cabecera**. Borrar una tabla: clic derecho o botón de tabla de la toolbar →
  *Delete table*.
- **Asas en el borde** (prototipo aprobado 2026-11): al pasar el ratón por una celda aparece una pestaña
  fina sobre el **borde superior de su columna** y otra en el **borde izquierdo de su fila** (cabecera
  incluida); crecen y muestran un grip al acercarse. **Clic** = selecciona la columna/fila entera y abre
  su menú (el asa queda en color de acento; otro clic lo cierra). **Arrastrar** el asa reordena: una
  línea de acento marca el hueco de destino, la línea arrastrada se atenúa y una etiqueta sigue al
  puntero; al soltar, la línea queda seleccionada en su sitio nuevo. `Esc` cancela; soltar donde estaba
  no hace nada. La fila de cabecera lleva un **candado**: no se arrastra, y si arrastras una fila sobre
  ella la cabecera se raya en rojo y la etiqueta avisa *The header is fixed*.
- **Menú de columna:** *Insert left / right*, *Duplicate column*, *Move left / right*, *Align column*
  (izquierda/centro/derecha; persiste vía `:---:` y el menú sigue abierto), *Reset width* (deshabilitada
  si la columna ya se ajusta a su contenido; no aparece en notas vinculadas), *Sort A → Z / Z → A*
  (*1 → 9 / 9 → 1* si la columna es numérica), *Clear column* (vacía los datos, **no** el nombre de la
  cabecera) y *Delete column* (en rojo). **Menú de fila:** *Insert above / below*, *Duplicate row*,
  *Move up / down*, *Clear row* y *Delete row*; en la cabecera, *Clear header* y una nota explicando que
  es fija. Lo imposible sale **deshabilitado, no oculto**, con el motivo al pasar el ratón (mover la
  cabecera, insertar encima de ella, borrar la única columna, ordenar con menos de dos filas…).
  Teclado: ↑/↓ recorren las opciones, `Enter` ejecuta, `Esc` cierra. Cada acción = un solo `Ctrl+Z`.
- **Barras «+»:** al acercar el ratón al borde derecho (o inferior) de la tabla aparece una barra fina
  con «+» que **añade una columna (o fila) al final** y pone el cursor en su primera celda. Solo ocupan
  hueco de la propia tabla (su margen inferior, el margen derecho del editor): nunca tapan el párrafo
  siguiente ni las celdas, así un clic ahí siempre pone el cursor. Por eso, en el editor, debajo de cada
  tabla queda algo más de aire que en las vistas de solo lectura. Si no hay sitio (p. ej. una tabla ancha
  en una sticky estrecha) la barra se adelgaza o no aparece; añadir sigue en los menús.
- **Resumen de la selección:** con **2 o más celdas** seleccionadas (un rango, una fila o una columna
  entera) aparece bajo la tabla una pastilla con la **suma**, y si hay 2+ números también la **media**,
  el **mínimo** y el **máximo**, seguidos de "N números · M celdas"; sin números, "M celdas · K con
  texto". Los números salen con el formato del idioma de la app (`1,234.5` / `1234,5`). La **cabecera
  nunca se suma**: al seleccionar una columna entera solo cuentan sus datos; seleccionar solo celdas de
  la cabecera las cuenta como celdas. Es solo informativa (no se pulsa ni se copia); comparte el hueco
  bajo la tabla con la barra «+», que se acorta a su derecha.
- **Clic derecho** en una celda (y el botón de tabla de la toolbar dentro de una tabla): menú **corto**
  — *Row*: insertar encima/debajo y eliminar; *Column*: insertar a la izquierda/derecha y eliminar;
  *Clear N cells* si hay varias celdas seleccionadas; y *Delete table*. Duplicar, alinear y ordenar están
  en los menús de las asas. Clic derecho dentro de la selección de celdas la conserva; fuera, mueve el
  cursor a la celda pulsada.
- Asas, «+», cambiar el ancho y clic derecho funcionan también en las **notas sticky** (que no tienen
  toolbar); en las **notas vinculadas** editables todo salvo el ancho de columna; nada en solo lectura.
  Ya no hay hilera de mini-botones de tabla bajo la toolbar.
- **Cabecera obligatoria:** no se puede borrar la fila de cabecera ni insertar una fila
  por encima de ella (las pipe-tables de markdown exigen cabecera). Las celdas de cabecera
  vacías se quedan vacías (sin texto guía).
- **Aspecto (prototipo aprobado 2026-11, cabecera "Etiqueta"):** la cabecera es una **etiqueta
  pequeña en mayúsculas, gris (texto atenuado) y con tracking**, sin fondo ni color de acento; filas
  sin cebreado, solo la rejilla fina del borde del tema. Con el editor enfocado, la **celda del
  cursor** lleva un contorno fino del color de acento; una **selección de celdas** (arrastrar entre
  celdas o `Shift`+clic) se tiñe de acento con **un único contorno** alrededor del rango, sin la
  selección de texto nativa encima. Igual en todos los temas (solo variables del tema).
- **Columnas ajustadas al contenido por defecto:** cada columna toma el ancho de su contenido, con un
  mínimo (una celda vacía sigue siendo cómoda de clicar) y un máximo (el texto largo salta de línea
  dentro de la celda). Una tabla estrecha no ocupa todo el ancho; una que no cabe **conserva el ancho
  natural de sus columnas** (no las estrecha: las etiquetas cortas no se parten en dos líneas) y hace
  **scroll horizontal** propio, sin desbordar la nota. Igual en el chat de IA, las vistas previas y los
  stickies; en las tarjetas del resumen de nota (no hacen scroll) las columnas automáticas sí se
  estrechan hasta el mínimo y lo que no cabe se recorta.
- **Cambiar el ancho de una columna:** al acercar el ratón al **borde derecho** de una columna aparece
  una línea de acento y el cursor de redimensionar; **arrastrar** cambia el ancho en vivo (a saltos de
  medio carácter, desde el ancho mínimo de una columna automática —y nunca más estrecha que la palabra más
  larga de su cabecera, que no se parte— hasta unos 80 caracteres) y al soltar queda guardado — un solo
  `Ctrl+Z` lo deshace;
  `Esc` cancela el arrastre. **Doble clic** en el borde, o *Reset width* en el menú de la columna, la
  devuelve a ajustarse al contenido. Una columna con ancho lo mantiene aunque cambie el texto (una
  palabra muy larga de una celda se parte en vez de ensancharla; si luego la cabecera recibe una palabra
  más larga, la columna se ensancha lo justo para no partirla), viaja con ella al moverla o duplicarla y se ve igual
  en las vistas previas, el resumen y los stickies, porque escala con el tamaño de letra. Se guarda en el
  propio markdown, en el nº de guiones de la fila separadora (`| ------------ | --- |`): cualquier editor
  sigue viendo una tabla normal. Las tablas que vienen de fuera (pegadas como texto, las del chat de IA,
  las formateadas por otra herramienta) entran con columnas automáticas. En las **notas vinculadas** no
  se ofrece (es un fichero Markdown externo: sus separadores se quedan en `---`). La app móvil aún no lo
  conserva.
- **Enter en una celda** crea otra línea en la celda; se guarda como salto de línea (`<br>`) y al
  reabrir es una línea más del mismo párrafo (antes las dos líneas se guardaban pegadas: `ab`).
- **Atajos de teclado** (con el cursor o una selección de celdas en una tabla; `Mod` = Ctrl, ⌘ en
  macOS): `Alt+↑/↓` mueve la fila (solo filas de cuerpo: la cabecera no se mueve ni nada sube por
  encima de ella); `Alt+←/→` mueve la columna con su cabecera y su alineación (`⌘⌥←/→` en macOS, donde
  `⌥←/→` salta palabras); `Mod+Enter` inserta una fila debajo (en la cabecera, justo debajo de ella);
  `Mod+Shift+Enter` una columna a la derecha; `Mod+D` duplica la fila (la cabecera no); `Mod+Shift+⌫`
  elimina la(s) fila(s) y `Alt+Shift+⌫` la(s) columna(s). El cursor va a la fila/columna nueva o a la
  copia; cada atajo se deshace con un solo `Ctrl+Z`. En los bordes (primera fila hacia arriba, última
  columna a la derecha…) no hacen nada. Fuera de una tabla las teclas siguen como siempre (`Mod+Enter`
  = salto de línea, `Alt+↑/↓` = mover ítem de lista); dentro de una lista en una celda, `Alt+↑/↓`
  mueve el ítem, no la fila. `Tab`/`Shift+Tab` = celda siguiente/anterior (`Tab` en la última celda
  añade una fila); `Enter` = otra línea en la celda. Listados en Ajustes → Atajos → *Tables* y, a la
  derecha de cada opción, en los menús de las asas y del clic derecho / toolbar. Con un menú de tabla
  abierto los atajos siguen funcionando (actúan sobre la línea que el menú seleccionó) y, si cambian la
  tabla, el menú se cierra.
- **Retroceso/Supr con celdas seleccionadas** las **vacía** (nunca borra filas ni la tabla, aunque
  estén todas seleccionadas). Borrar la tabla: botón de tabla de la toolbar o clic derecho →
  *Delete table*.
- **Copiar/cortar celdas** (selección de celdas): se copian como **texto separado por tabuladores**
  (una celda sola, su texto tal cual), que cae en celdas al pegar en Excel/Sheets (también con "pegar
  solo valores"), y como tabla para pegar dentro de NoteFlow (conserva negritas, enlaces…). Cortar
  vacía las celdas, sin borrar filas.
- **Pegar desde una hoja de cálculo** (Excel, Google Sheets, Numbers, LibreOffice) o texto con
  tabuladores: fuera de una tabla crea una **tabla nueva** con la primera fila como cabecera (el texto
  de las celdas tal cual, sin interpretar `*` ni `|`); dentro de una tabla **rellena las celdas** desde
  la celda del cursor, ampliando filas/columnas si hace falta (o rellena la selección de celdas). No se
  pega además la imagen del rango que añade Excel. Prosa con algún tabulador, listas de Word, código
  indentado, CSV o una tabla markdown no se convierten en tabla por esto. Si la celda de la hoja
  lleva un enlace o texto con formato parcial, se pega como tabla HTML (siguiente punto) para no
  perderlo; la negrita de celda entera de Excel/Sheets no se conserva.
- **Pegar una tabla HTML** (web, Word, Google Docs…): si tiene enlaces, negritas, cursivas… se
  conservan (dentro o fuera de otra tabla); una tabla sin formato entra igual que desde una hoja de
  cálculo. En ambos casos se ajusta a lo que markdown puede guardar — la primera
  fila pasa a ser la cabecera, las celdas combinadas se separan (el contenido queda en la primera), las
  tablas anidadas pasan a texto, el título (`<caption>`) se descarta y la alineación es una por
  columna. Dentro de otra tabla, sus celdas entran en las celdas (nunca una tabla dentro de otra).
- **Pegar markdown con tabla:** en modo markdown, pegar texto que contenga una
  tabla markdown (`| a | b |` + fila separadora `|---|---|`) la convierte en tabla real
  (antes se pegaba como texto literal). El modo texto muestra siempre el fuente tal
  cual — para verla renderizada hay que cambiar a modo markdown.

### Imágenes
- Drag & drop o paste desde el portapapeles.
- Redimensionables arrastrando los bordes.
- Se guardan como base64 inline en el `.md`.

### Bloques de código
- Aspecto limpio: borde fino uniforme, mismo fondo que el editor y poco relleno alrededor del código.
  El código se ve 1px más grande que el código inline.
- Dos botones redondeados que **solo aparecen al pasar el ratón** por el bloque, flotando
  sobre el borde superior del bloque (lo tapan): **Copy** a la derecha y el **selector de lenguaje** a la izquierda.
- **Selector de lenguaje**: muestra el lenguaje actual ("Plain text" si no hay ninguno). Al pulsarlo
  abre un desplegable con un buscador y la lista de lenguajes soportados; la primera opción,
  **"Plain text"**, desactiva el resaltado. Los botones siguen visibles mientras el desplegable está
  abierto. Se cierra al hacer click fuera o con Escape.
- Syntax highlighting con Lowlight.

### Relacionar secciones (slash command `/`)
- Mientras escribes en el editor en **modo markdown**, teclea `/` → aparece un **menú de comandos** con
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
  sincroniza, sobrevive export/import y en **modo texto** se ve como `[Nombre](noteflow://…)`. El
  slash command solo está en modo markdown; el buscador excluye notas cifradas/archivadas/temporales.

### Tablero kanban dentro de la nota
- En el editor en **modo markdown**, `/kanban` (o `/board`, en cualquier idioma) o el botón **kanban** de la
  toolbar (justo tras el de tabla) insertan un tablero con tres
  columnas: **To do / In progress / Done** (en español *Por hacer / En curso / Hecho*). Puede haber
  varios por sección. En **modo texto** se ve tal cual es en disco: markdown plano entre
  `<!-- kanban done="Done" -->` y `<!-- /kanban -->` (columnas = `- Nombre`, tarjetas = tareas
  indentadas `  - [ ] …` con sus 📅⏰🔺), así sincroniza y lo leen el CLI/móvil/otros editores.
- **Ocupa todo el ancho** del editor (no respeta la columna *Readable*); si las columnas no caben,
  el tablero hace **scroll horizontal** propio (la barra solo se ve con el ratón encima del tablero o
  durante un arrastre; su hueco queda reservado). Columnas de ancho fijo, con **contador** de tarjetas.
- **Tarjetas:** checkbox, texto con formato (negrita, links, resaltado, pills de "Link section" —
  clic navega), y los mismos chips que las tareas: **📅 deadline + ⏰ alarma** y **🔺 importancia**
  (con sus pickers; al pasar el ratón aparecen los iconos de bandera/calendario y un menú `⋯` con
  *Edit text* / *Delete card*). Clic en el texto → edición en línea (Enter guarda, Esc cancela); si
  escribes `📅2026-10-12` o `🔺high` en el texto se convierten en chips. Las sub-viñetas que tuviera
  la tarjeta en el markdown se conservan (chip "≡ n" con tooltip; se editan en modo texto).
- **+ Add card** al pie de cada columna (Enter añade y deja el campo listo para la siguiente;
  Esc cierra) y **+ Add column** al final del tablero.
- **Columnas:** clic en el título para renombrar; menú `⋯` con *Rename*, *Mark as done column* /
  *Unset done column* y *Delete column* (si tiene tarjetas pide un segundo clic de confirmación).
- **Columna "done"** (la de Hecho, marcada con ✓ verde): arrastrar una tarjeta **a** ella la marca
  como hecha y sacarla la desmarca; marcar el checkbox de una tarjeta la **mueve al final** de la
  columna done; desmarcarla estando en done la devuelve al final de la primera columna. Sin columna
  done, el checkbox solo marca/desmarca.
- **Drag & drop** de tarjetas (dentro de una columna o entre columnas) y de columnas (arrastrando su
  cabecera), con una línea de color que indica dónde caerá; cerca de los bordes el tablero y la nota
  se desplazan solos. `Esc` cancela el arrastre.
- Cabecera discreta "KANBAN · n columns · n cards": clic → selecciona el tablero (`Backspace`/`Delete`
  lo borra). Al pasar el ratón: **Convert to task list** (todas las tarjetas a una lista de tareas) y
  **Delete board**. Dentro de una lista de tareas, el menú `/` ofrece **Convert task list to board**
  (las tareas pasan a la primera columna); ahí el botón kanban de la toolbar hace lo mismo en vez de
  insertar un tablero nuevo (su tooltip pasa a *Convert task list to board*). Todo se deshace con `Ctrl+Z`.
- La búsqueda en la nota (`Ctrl+F`) también encuentra y resalta texto dentro de las tarjetas y los
  títulos de columna. Los previews de sección (hover, vistas de grupo/nota) y el chat de IA lo
  muestran como un mini tablero de solo lectura.

### Fragmentos (Snippets) — botón del toolbar y menú `/`
Texto reutilizable que se inserta en el cursor con un clic, con fecha/hora del momento.
- **Botón partido** en la toolbar (icono de sello, tras el kanban): el clic principal inserta el
  **fragmento por defecto** (tooltip *Insert snippet: <nombre>*); el chevron abre la lista de todos
  (nombre + vista previa de una línea, ya con la fecha de ahora) y al final **Configure snippets…**.
  Sin fragmentos, el clic principal abre directamente la configuración. El editor no pierde la
  selección (lo seleccionado se sustituye). Solo en Modo markdown (en Modo texto no hay toolbar).
- **También con `/`**: el menú de comandos lista los fragmentos tras los comandos integrados, bajo el
  encabezado *Snippets* y con el icono de sello, con su vista previa de una línea. Se filtran
  escribiendo parte del nombre (`/diar…`), y `/snippet` o `/fragmento` los muestra todos en cualquier
  idioma. Funciona aunque el botón esté oculto del toolbar; los fragmentos vacíos no aparecen. Solo en
  Modo markdown, como el resto de `/` (en Modo texto `/` es un carácter más).
- Se inserta como **markdown**: encabezados, listas y checkboxes se renderizan; un fragmento de una
  línea sin sintaxis de bloque entra inline en el texto. En un bloque de código entra literal.
- **Modal "Snippets"** (ventana dentro de la app, Escape cierra, autoguardado): lista a la izquierda
  (`+` nuevo, estrella = por defecto, ↑/↓ reordenar, papelera = borrar con confirmación en la propia fila) y
  editor del seleccionado: nombre + contenido (textarea markdown).
  - **Insert date / time**: formatos predefinidos (`DD-MM-YYYY`, `DD/MM/YY`, `YYYY-MM-DD`, fecha larga
    con nombre del día y del mes, `ddd DD-MM-YY`, `D MMM YYYY`, `HH:mm`, `hh:mm A`, `DD-MM-YYYY HH:mm`,
    `YYYY-MM-DD HH:mm:ss`) o **formato personalizado** libre, con el **resultado en vivo**; *Insert
    into snippet* mete la variable en la posición del cursor del contenido. Leyenda de tokens
    (desplegable *Tokens*) y aviso: **el mes es `MM`, `mm` son minutos**.
  - **Preview** del fragmento completo expandido con la fecha actual.
  - **Suggestions** con *Add*: Today's date, Date and time, Journal entry (`## <fecha larga>` + línea
    vacía), Meeting (encabezado con fecha + Attendees / Notes / Action items con `- [ ]`), Divider
    with time (`---` + hora en negrita), Signature. Se añaden en el idioma de la UI como fragmento
    editable. La lista empieza vacía (sin siembra), con las sugerencias a la vista.
- **Variables:** `{date}` (`DD-MM-YYYY`), `{time}` (`HH:mm`), `{datetime}` (`DD-MM-YYYY HH:mm`), o con
  formato `{date:dddd, D [de] MMMM}`; `date`/`time`/`datetime` son el mismo instante (el del clic).
  Tokens estilo moment: `YYYY YY MMMM MMM MM M DD D dddd ddd HH H hh h mm m ss s A a`, `[texto]` literal.
  Los nombres de día y mes van en el idioma de la UI (español en minúscula). Otras `{…}` se dejan tal cual.
- Se guardan en `snippets.json` del dir de notas → se **sincronizan** (GitHub y NoteFlow Cloud; Cloud
  los fusiona por id entre dispositivos).

### Búsqueda dentro de la nota
- `Ctrl+F` (con el editor enfocado) → barra de "Find in note" que resalta coincidencias (también
  dentro de los tableros kanban).
- `Enter`/`Shift+Enter` (o las flechas de la barra) saltan al siguiente/anterior; el match activo
  queda **centrado verticalmente** en el editor (también al escribir la consulta).
- Funciona en ambos modos (markdown y texto).

### Tamaño de fuente
- `Ctrl++` aumentar · `Ctrl+-` disminuir · `Ctrl+0` reset.
- También desde Settings → Editor (fuente y tamaño).

### Ancho del contenido (Full / Readable)
- Settings → Editor → **Content width**: alterna entre `Full` (por defecto, el contenido ocupa todo el
  ancho del área del editor) y `Readable` (columna de lectura centrada de ~72 caracteres, estilo
  Obsidian/iA Writer).
- En modo `Readable` se centran los bloques de texto (párrafos, headings, listas, citas,
  separadores) **y los bloques de código**; las **tablas** empiezan en el borde izquierdo de la
  columna y, si su contenido es más ancho, crecen centradas sobre ella hasta el ancho del editor
  y, si aun así no caben, hacen scroll horizontal; los **tableros kanban** van más allá y ocupan el
  editor de borde a borde. Las **imágenes** viven en la columna:
  mientras caben (sin redimensionar, o redimensionadas hasta el ancho de la columna) quedan
  alineadas a la izquierda de la columna, como en `Full`; si el usuario las **agranda más allá de
  la columna** con el tirador, **rompen los márgenes**, creciendo centradas sobre la columna (media
  por cada lado) hasta ocupar **todo el ancho de la nota**. El tirador sigue al cursor en ambos
  tramos y no deja guardar un ancho mayor que el que se puede mostrar. Solo las imágenes de un
  párrafo de primer nivel (no las de listas, citas o tablas). El ancho de columna se deriva del tamaño de fuente base del cuerpo (no del de
  cada elemento), así los headings comparten la misma columna. Aplica a ambos modos (markdown y
  texto); no afecta a los stickies.
- En `Readable`, las acciones de cada tarea (el botón de importancia + deadline con sus chips) se sacan al margen
  derecho, fuera de la columna, cuando el editor mide ≥ 58em (container query en `src/index.css`).
  Si el bloque no cabe en el margen (badge con fecha + alarma), se desplaza hacia la izquierda
  solapando el final de la columna en vez de provocar scroll horizontal; el contenedor de scroll
  del editor es además `overflow-x: hidden` (tablas y código tienen su propio scroll interno).
  Con el índice visible, el borde derecho de esas acciones se acota además contra las rayitas del
  índice (se desplazan a la izquierda antes de llegar a ellas).
- Preferencia en `editorSettingsStore` junto a fuente/tamaño, **sincronizada** en `ui-settings.json`
  (`localStorage` `noteflow-readable-width` queda solo como dual-write legacy/seed).

### Progreso de las checklists (riel en el margen)
- Con ancho **Readable**, cada checklist de 2 o más tareas lleva a su **izquierda**, en el margen, un
  **riel** vertical fino que va de la primera a la última tarea. El tramo hecho se rellena desde arriba
  en el verde de las casillas, con un remate circular y una etiqueta pequeña («3/8», «✓» al 100 %) que
  baja con el avance. Cuenta también las subtareas; un párrafo o heading entre medias empieza otro bloque.
- Al pasar el ratón: «3 de 8 tareas hechas · 38 %» o «lista completa». Al completar la lista hace un
  pequeño rebote (sin animaciones si el sistema pide reducir movimiento).
- Solo si cabe en el margen (deja sitio al asa de arrastre): si la ventana es estrecha, la fuente grande
  o el índice quita sitio, se esconde. Nunca mueve el texto. No sale en notas flotantes, vistas previas
  ni el chat de IA.
- Ajustes → Editor → **Checklist progress** (activado por defecto, sincronizado). Con ancho `Full` el
  interruptor queda deshabilitado («solo con Readable») y conserva su valor.

### Índice flotante (table of contents)
- En el borde derecho del editor hay un **indicador discreto**: una rayita corta por encabezado
  (H1 más larga, H3 más corta), con la del encabezado en el que estás más marcada. Solo aparece si la
  sección tiene encabezados (H1–H3, los vacíos se ignoran).
- **Al pasar el ratón** (o al llegar con Tab) se despliega el **panel del índice**, superpuesto al
  texto, con los títulos sangrados por nivel y con jerarquía tipográfica (H1 > H2 > H3). El
  encabezado activo va en **negrita**. Se recoge al sacar el ratón (Escape devuelve el foco al editor).
- **Click en una entrada** → scroll suave hasta ese encabezado (sin mover el caret); el panel sigue
  abierto mientras el ratón esté encima. Se actualiza en vivo al escribir; títulos largos con elipsis
  (tooltip con el texto completo). Con muchísimos encabezados las rayitas se compactan (máx. 40,
  priorizando H1/H2).
- El editor solo reserva el hueco de las rayitas, así que en reposo nunca tapa el texto. En editores
  muy estrechos (< 420 px, p. ej. paneles divididos muy estrechos) se oculta.
- Sale en el editor principal, en cada panel del split y en la ventana de sección; **no** en stickies
  ni en modo texto.
- Settings → Editor → **Table of contents** (switch, activado por defecto); se sincroniza con el resto
  de ajustes del editor.

### Qué abre el clic en una nota (Editor / Note overview)
- Settings → Editor → **Clicking a note opens**: selector `Editor / Note overview` (por defecto
  `Editor`, el comportamiento de siempre). Con `Note overview`, pulsar en la barra lateral una nota con
  **más de una sección** abre su [vista de nota](#vista-de-nota-note-overview) en vez del editor.
- Aplica al clic en la fila de la nota del sidebar, en el peek de un grupo y a `Intro` sobre un
  resultado de búsqueda. **No** cambia: el clic en una celda/pestaña de sección (va a esa sección en el
  editor), `Ctrl/Cmd+clic` (abre la nota al lado en el editor), las notas de una sola sección ni las
  cifradas bloqueadas (siempre al editor).
- Se sincroniza con el resto de ajustes del editor.

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
  progreso. También hay un toggle **"Local AI"** en Settings → AI ("Your notes and AI").
- **Panel Related:** al cambiar de sección/nota, el panel actualiza las relacionadas; click en un
  resultado navega a esa sección. Las notas **cifradas se omiten** (no entran al índice).
- **Reindexar:** botón "Reindex" en Settings → AI (junto al toggle "Local AI", muestra progreso); el índice también
  se mantiene al día solo al guardar (incremental, debounce).
- Roadmap: este índice alimenta la **vista cerebro** (Fase 2 ✅) y el **chat RAG** (Fase 3 ✅, ver
  "Panel de IA" más abajo). Un índice, tres consumidores. Detalle técnico en `.agents/context/ai.md`.

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
- **Aspecto 3D (por defecto):** un **cerebro humano de alambre y puntos** —silueta lateral
  reconocible, circunvoluciones en relieve (bandas con el contorno brillante y surcos vacíos),
  cerebelo y tronco— que deja ver su interior tenue. Las **notas viven en la corteza** agrupadas
  alrededor de su grupo (cada carpeta con su parche), las relaciones viajan por dentro, las **notas
  sueltas favoritas** van al cerebelo y el **perfil de IA** ("IA Generated") ocupa el núcleo. Está
  vivo: se "enciende" desde el núcleo al abrir, **impulsos** recorren las ramas de cada grupo y las
  relaciones se disparan solas, hay **ondas** al tocar una nota y cuando la IA responde, y un
  **latido** suave desde el núcleo. Con "reducir movimiento" del sistema queda quieto en reposo
  (solo se mueve lo que responde a tus acciones: girar, pasar el ratón, la IA escribiendo); con la
  ventana minimizada u oculta en la bandeja deja de dibujar.
- **Interacción (3D):** **arrastrar gira** el cerebro alrededor de su centro (deja de rotar solo al
  primer toque) y la **rueda hace zoom** sobre ese mismo centro. Los nombres aparecen por niveles al
  acercarse: grupos siempre, luego carpetas, luego notas; nunca se solapan y los de la cara de atrás
  salen atenuados. En el fallback 2D (sin WebGL o equipos modestos): pan, zoom y arrastrar nodos.
  **Hover/seleccionar** una nota **resalta sus conexiones de
  contenido** y atenúa el resto. **Click en un nodo de nota/sección** ancla junto a él una
  **ventanita de previsualización clicable** (la misma tarjeta apaisada que la
  [previsualización al hover](#previsualización-de-sección-al-hover), del mismo tamaño; su borde se
  marca al pasar el ratón); al **pulsar dentro de la ventanita** se navega a esa sección en el editor. Se cierra con click fuera o `Esc`.
  Click en un grupo abre la vista de contenido en ese grupo. Los nombres de las notas aparecen al acercar el zoom.
- **Toggle "Contenido":** botón en la barra superior para mostrar/ocultar la capa de contenido y
  dejar solo la estructura.
- **Sin IA:** el cerebro funciona igualmente mostrando solo la estructura + el CTA de activación.
- **Iluminación por chat:** cuando el chat responde, las notas que usó **se encienden** en el grafo
  (anillos que se expanden y una onda desde cada nota en 3D / glow en 2D) — no se llenan de
  etiquetas, solo brillan. Mientras la IA escribe, varias notas "barren" sus relaciones a la vez.

---

## Panel de IA — chat + segundo cerebro (Fase 3 de "El Cerebro")

La mitad izquierda de la vista cerebro. Su UI sigue el idioma de la app (EN/ES). Pestañas:

- **Chat:** conversación con un LLM que responde **usando tus notas como contexto** (RAG). Streaming
  token a token, botón de **parar**, y **citas** clicables debajo de la respuesta (abren la nota en su
  sección) que además **iluminan** esas notas en el cerebro. Arriba: **historial** de chats (crear,
  abrir, borrar — se guardan localmente), botón **nuevo chat**, y un **selector de modelo** para elegir
  con qué modelo se hace la siguiente pregunta (con NoteFlow AI, si el modelo elegido gasta la cuota al
  menos el doble de rápido que el recomendado, un pequeño badge rojo **"x29"** a su izquierda lo avisa;
  tooltip "This model uses 29× more of your quota than the recommended one"; también en el panel lateral).
  Si no hay proveedor configurado, muestra un CTA a Ajustes.
  - **¿Ha terminado?** Mientras la IA trabaja siempre hay una señal al pie del chat: **"Thinking…"**
    cuando piensa sin escribir (al empezar, entre acciones o si se queda >~1 s callada a mitad de
    respuesta), **tres puntitos pulsando** mientras escribe, o la propia fila de la acción en curso /
    la tarjeta de confirmación. Cuando no queda ninguna señal, la respuesta ha terminado.
  - **Adjuntar archivos (📎):** junto al campo de escribir hay un botón de clip para mandar **imágenes,
    PDFs y .txt/.md** con tu pregunta — lo que el **modelo activo** admita (Anthropic: PDF+imágenes+texto;
    OpenAI-compatibles: imágenes+texto; .txt/.md siempre). En **NoteFlow AI** la visión va por modelo
    (la marca el catálogo del servidor); hoy todos los modelos curados aceptan imágenes, incluido el
    recomendado que viene elegido por defecto. Los archivos elegidos aparecen como **chips
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
  - **Deshacer lo que hizo la IA:** cada edición de una nota (crear nota, editar/renombrar/añadir
    sección, cambiar título o grupo…) muestra un botón **Deshacer** en su fila; al pulsarlo se
    revierte **solo lo que cambió esa edición** (si la IA creó la nota, se borra): lo que tú editaste
    después en otras secciones o en la nota se conserva. Solo pregunta antes si tú (u otra edición
    posterior) volviste a tocar justo lo que cambió la IA ("Lo que editó la IA cambió después").
    No se puede deshacer si la nota o la sección que cambió la IA se borraron después, ni si la nota se cifró o
    descifró después (lo avisa). Los borrados no tienen Deshacer: ya piden confirmación. Solo dura
    mientras la app está abierta (tras reiniciar, el botón desaparece).
- **Related:** las "Related notes" por sección (lo que antes estaba al pie del cerebro), eligiendo
  cualquier nota/sección como origen. Necesita la IA local (embeddings) activada.
- **Profile:** cuestionario del **segundo cerebro** — **no aparece solo**: al entrar al cerebro
  siempre aterrizas en el chat (o en el proveedor, si aún no configuraste ninguno) y el cuestionario
  se abre cuando pulsas la pestaña **Profile** (o desde la paleta / Ajustes → IA, botón "Redo questionnaire"). Pensado para
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
- **⚙ Settings (proveedor):** sección **Assistant** con un resumen a la derecha del título: "Answers
  with <modelo>" solo si el proveedor activo puede responder; si no (p. ej. recién instalada: Anthropic
  elegido **sin clave**), **"Not set up"**. Debajo, **una lista con borde y tres filas con radio** —
  **NoteFlow AI** (etiqueta "€5.99/month"; "In your plan" si lo tienes; "Add to your plan" si pagas
  Cloud), **Your API key** ("Free" — pagas a tu proveedor) y **Local model** ("Free", Ollama) —; la del
  proveedor en uso lleva la pastilla verde **"In use · <proveedor>"** (solo si de verdad funciona). La
  fila elegida (al abrir: la que está en uso, o NoteFlow AI si no hay nada configurado) se despliega
  con un **formulario de etiquetas a la izquierda** (Model, Connection, etc.). **Todos los campos se
  ven y se guardan antes de activar** la fuente: si la elegida no es la que usa el chat, un pie
  discontinuo dice "The chat now uses X." con el botón **"Use <proveedor>"**. En el panel del Cerebro,
  estrecho, las etiquetas van encima de cada control.
  - **Model:** un desplegable con una fila por modelo (radio, nombre, chip "Recommended" y chip
    "≈N× quota" amarillo, rojo desde ≈10×). **Connection:** botón "Test" con el resultado al lado
    ("✓ Responds" o el error).
  - **NoteFlow AI (suscripción):** plan gestionado — sin API key ni Base URL (usa tu cuenta NoteFlow).
    Filas **Quota** (barra de consumo mensual en porcentaje, "N% of this month’s AI allowance used":
    la asignación se mide por el coste real de cada petición, así que los modelos caros la gastan
    antes), **Model** (solo los modelos curados: sin texto libre — hoy ≈2× y ≈29× en los chips) y
    **Connection**. La lista de modelos la sirve el servidor: los modelos nuevos **aparecen solos** (sin
    actualizar la app), se recuerda entre arranques y offline, y tu modelo elegido no cambia. **Sin el
    plan** (sin sesión o sin suscripción), la fila muestra **Plan** con el precio y "View plan", que abre
    el **detalle del plan** en lugar de la lista (enlace "← AI options"): a la
    izquierda **"What's included"** (sin Ollama ni API keys, modelos eficientes con tools e imágenes,
    asignación mensual con consumo visible, catálogo siempre al día, y "si cancelas, vuelves a tu
    propia clave o a un modelo local"); a la derecha **una caja de plan** con el precio mensual y
    debajo el anual con su ahorro ("or €49.99/year · save 30%"; mensual o anual se elige en la página
    de pago, y la caja lo dice), y la acción: **sin
    sesión, el inicio de sesión ahí mismo** (correo → código; también para quien ya paga); con sesión,
    **"Continue to payment"** (abre el checkout de Lemon Squeezy en el navegador). Nota "VAT included ·
    you pay on a secure page (Lemon Squeezy) · cancel anytime". El **Bundle** es solo una línea al pie
    ("Want your notes synced too? NoteFlow Bundle brings AI and Cloud together for €7.99/month" →
    "Choose the Bundle"). **Si ya pagas Cloud**, la caja es la **mejora a Bundle** (no te vende la IA
    suelta: Cloud + AI sueltas costarían más que el Bundle): "Your subscription becomes the Bundle…", el
    diferencial **"+€4.00/month"** (y "+€40.00/year si pagas anual"), el total y "Switch to Bundle" →
    confirmación con el prorrateo (ver Ajustes → Cuenta). Con el plan sin verificar, "Couldn't verify
    your plan yet — Retry" en vez de cualquier oferta. Los precios salen en el formato del idioma
    ("€5.99" en inglés, "5,99 €" en español). Vale igual en Ajustes → IA y en el **panel de IA del
    Cerebro**.
    **Se activa solo lo que tienes pagado** (NoteFlow AI con el plan AI, NoteFlow Cloud con el plan
    Cloud, ambos con el Bundle) en dos momentos: **al iniciar sesión** (primer login, dispositivo nuevo
    o vuelta a tu cuenta) y **al suscribirte con la sesión ya abierta** (pagar → Refresh en
    Ajustes → Cuenta). Una sesión que se **restaura al arrancar la app no cuenta como login**: si
    apagaste Cloud o elegiste tu propio proveedor, no se te vuelve a cambiar en cada arranque. Al revés,
    cuando la app **confirma** con el servidor que una suscripción ya no está activa (p. ej. Refresh en
    Ajustes → Cuenta, o el primer chequeo tras abrir la app si caducó con ella cerrada), **apaga
    sola** lo que pagaba, igual que al cerrar sesión: NoteFlow Cloud se desactiva (los cambios pendientes
    de subir no se pierden y GitHub Sync se reanuda si lo tenías conectado) y el asistente vuelve a tu
    último proveedor propio. Si no se pudo verificar el plan (sin red), no se apaga nada. Volver a
    suscribirte con la app abierta lo reactiva solo.
  - **Your API key / Local model (gratis):** "Your API key" lista en **Provider** los proveedores con
    clave (Anthropic/Claude, OpenAI, DeepSeek, MiniMax, Moonshot, OpenRouter, OpenCode Zen) y "Local
    model" en **Server** los que no la necesitan (**Ollama** preseleccionado, o Custom
    OpenAI-compatible). Pegas tu **API key** si hace falta (guardada se ve enmascarada con ✓ y
    "Change"/"Remove"), ajustas la URL, eliges el modelo (o "Type another model…"; "Load list" /
    "Detect" lo pide al proveedor) y pruebas la conexión. **Cada proveedor recuerda su propia
    key/modelo/URL** — cambiar de proveedor no las mezcla, y editar uno que no está en uso no toca el
    que usa el chat. Las claves se guardan cifradas y nunca salen de tu máquina.

> **Dos interruptores independientes:** la **IA local** (embeddings, se activa en el cerebro) da
> contexto RAG y conexiones de contenido; el **proveedor LLM** (Ajustes) da el chat. El chat funciona
> sin la IA local, pero entonces responde **sin contexto de tus notas**.

### Chat en el editor (sidebar flotante)

El mismo chat, **sin salir del editor**: botón con un **bocadillo con robot** (`BotMessageSquare`) a la
derecha del todo de la cabecera de la nota, justo debajo de los iconos de la barra de pestañas (con el
editor dividido, solo en el panel de la derecha). Su zona clicable es una franja que ocupa **todo el alto
de la cabecera** (título + fecha) pegada al borde derecho; desplegado se ve en gris discreto. Abre un **panel flotante** que entra deslizándose desde el
borde derecho (y sale igual al plegarlo) sobre la parte derecha del editor, sin empujar el texto, con
ancho ajustable arrastrando su borde izquierdo.
**Solo se pliega con ese mismo botón** y arranca plegado cada vez que abres la app. Es **la misma
conversación e historial** que el chat del cerebro, y se mantiene tal cual al cambiar de nota.
Cabecera sin título visible (solo el icono ✦), selector de modelo y tres botones de
icono a la vista: **Historial**, **Nuevo chat** y **Abrir en una ventana aparte**. A diferencia del
cerebro, este chat (el panel y su ventana aparte) **no muestra preguntas sugeridas** (ni al empezar ni
tras cada respuesta). Sin IA configurada, ofrece ir a **Ajustes → IA**.

- **Contexto (barra sobre el campo de escribir):** decides qué ve la IA además de tu perfil. Tres
  botones: **Sección: …** (la sección abierta), **Nota: …** (la nota entera abierta) y **Todas las
  notas** (búsqueda semántica en todas). Es **acumulable**: lo que añadas se queda como chip con ✕ al
  cambiar de nota, y los botones pasan a ofrecer la nota/sección nueva; puedes dejarlo sin nada. Un
  chat nuevo empieza con **la sección abierta**. Las notas cifradas y las secciones ocultas a la IA no
  se pueden añadir. Aunque el contexto sea reducido, la IA sabe qué nota tienes abierta y puede
  **editarla directamente** ("reescribe esta sección", "añade un resumen"): los cambios aparecen en vivo
  en el editor y cada uno se puede **deshacer**.
- **Ventana aparte:** el botón *Abrir en una ventana aparte* de la cabecera (deshabilitado mientras
  responde) mueve la conversación a una ventana propia
  (con barra de título, ⋯ con *Volver a la ventana principal* / Nuevo chat / Historial, una
  **chincheta** para mantenerla siempre encima y cerrar). Recuerda su tamaño y posición. Mientras está
  fuera, el botón del editor la trae al frente y el chat del cerebro muestra "El chat está en una
  ventana aparte" (*Mostrar ventana* / *Traer aquí*); "Ask AI" de la paleta pregunta en esa ventana.
  Al cerrarla, la conversación vuelve al panel del editor.

---

## Búsqueda y filtros

### Búsqueda global (sidebar)
- `Ctrl+Shift+F` → enfoca el input de búsqueda del sidebar (con el sidebar flotante, abre el panel).
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
- **What's new / Tutorial** abre el tour completo de novedades (ver "Tour What's new").

### Fechas
- No hay filtro de fecha ni calendario: la **vista de contenido**, en su orden por defecto («By date»),
  agrupa las notas en bloques por fecha (Today, Yesterday, This week, Last 30 days, Earlier); el selector
  de la cabecera permite verlas «In order», por grupos y carpetas. El sidebar tampoco tiene filtro de fecha (solo
  búsqueda, tags y archived).

### Filtros por tags
- Click en un tag del sidebar → filtra notas con ese tag. Click de nuevo → limpia.

### Notas archivadas
- Ocultas por defecto. Toggle `Show archived` / `Hide archived` en el menú ⋯ del footer. El mismo
  toggle revela también los **grupos archivados** (atenuados, al final de la lista).

### Footer del sidebar
- Franja fija bajo la lista (divisor de borde a borde). A la izquierda, una **línea de identidad** en
  una sola línea (si no cabe, se recorta con "…"; el círculo y el ⋯ nunca se encogen):
  - **Sin plan de NoteFlow**: círculo pequeño con la inicial (gris discreto según el tema) ·
    `<usuario> · <almacenamiento>`. Usuario = nombre de la carpeta home del sistema. Almacenamiento =
    *Local notes*, *GitHub · <repo>* (solo el nombre del repo) o *NoteFlow Cloud*, sin estado de sync.
    La inicial es la del usuario, o la del correo si hay sesión (sesión sin plan activo se ve igual).
  - **Con plan activo**: `<usuario> · <Plan> ⌄` (*Bundle*, *Cloud* o *AI*; inicial del correo de la
    cuenta). El nombre del plan es un mini desplegable hacia arriba: **Sync** (Ajustes → Sync) y **AI**
    (Ajustes → AI). Se cierra al elegir, con clic fuera o `Esc`.
- A la derecha, **⋯** ("More options") abre un menú hacia arriba. Sin plan activo (con o sin sesión),
  arriba del todo y separado, **Sync** (abre Ajustes → Sync); con plan no aparece porque ya está en el
  desplegable del plan. Luego tres bloques:
  **Theme** — *Light* / *Dark*: cada uno vuelve al **último tema de ese tipo** que usó el usuario
  (p. ej. Dark → Tokyo Night si fue el último oscuro), con NoteFlow Light / NoteFlow Dark si no hay
  ninguno recordado; el check marca el tipo del tema activo (con Dracula, *Dark*). Se recuerda elija el
  tema donde lo elija (Ajustes → Apariencia, este menú o llegado por sync) y se sincroniza con el tema
  · **Sections** — *As map* / *As row* (el ajuste "Sections in the sidebar", solo en este
  dispositivo) · **Show archived** / **Hide archived**. Se cierra al elegir, con clic fuera o `Esc`.

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
**cursiva**, **código inline** y el **borde izquierdo de las citas** ("Quote"). Cada control sin tocar sigue al tema (y cambia con él); el panel muestra un **preview en
vivo** de todo.

- **Swatches** (iguales en la fila de acento y en las 6 del editor): primero **"Text colour (follows
  the theme)" / "Color del texto (sigue al tema)"** — el color del texto del tema activo (blanco/claro
  en temas oscuros, negro/oscuro en claros) que **cambia solo al cambiar de tema**, para que un color
  oscuro elegido en un tema claro no se pierda en uno oscuro; luego 9 presets de saturación media
  que se leen en temas claros y oscuros (azul, teal, salvia, ocre, terracota, rosa, malva, violeta y
  gris pizarra); al final el **selector de color libre** (círculo con degradado cónico). Botones
  "Theme default" / reset por fila para volver al tema. El resumen bajo el preview muestra el acento
  como *theme*, *text* o *custom*.

**Sync entre dispositivos:** el tema y toda esta personalización (más los ajustes del editor:
tamaño/familia de fuente, ancho legible e índice flotante) viajan en `ui-settings.json` dentro del dir de notas,
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
  🔒 Unlock / Lock / Remove encryption   (solo si está cifrada)
  📋 Duplicate note
  ⇪ Export note…          ← popup de exportación con esta nota preseleccionada (no si está bloqueada)
  📦 Archive / Unarchive
  ─────────────
  📁 Move to folder ▸  /  Remove from group     (si está en un grupo)
  📁 Add to group ▸                              (si no tiene grupo)
  ─────────────
  ⧉ Open as Sticky Note   ← primera sección (no si está bloqueada)
  ▥ Open alongside        ← abre en paralelo (split); también con la nota bloqueada
  ⧉ Open in New Window    ← ventana solo-editor de la nota (no en notas cifradas)
  ─────────────
  🗑 Delete note   ← rojo
```

El menú de nota **no** ofrece "Note overview" (sí el de sección; la vista se abre con el botón ⊞ del
editor). Abierto desde el `⋯` de la vista de nota, el mismo menú añade **Rename note** arriba (renombra
en el título de la cabecera). **Open in New Window** reutiliza la ventana de sección (`openSectionWindow`), que muestra la
nota completa con sus tabs: se abre en la sección en la que se abriría la nota al pulsarla (la última
activa en esta sesión, `activeSectionByNote`; si no, la primera).

Click sobre un **tag de sección** (sidebar, vista de contenido, tarjetas de la vista de nota) o sobre un
**tab del editor**: se ocultan las acciones de nota (favorito, archivar, split, duplicar/exportar nota,
grupo/carpeta) y aparecen las de sección:
```
  🔒 Unlock / Lock / Remove encryption   (solo si está cifrada)
  ⊞ Note overview                         (no en una ventana de sección)
  ─────────────
  ✎ Rename section                        ← solo en el tab del editor: renombrado inline en el tab
  👁 Hide from AI / Show to AI            (no en notas cifradas)
  ⧉ Duplicate section                     ← copia a la derecha y navega a ella
  🎨 Section color
  ─────────────
  ⧉ Open as Sticky Note                   ← abre esa sección
  ▥ Open alongside                        ← panel nuevo en esa sección (no en una ventana de sección)
  ⧉ Open in New Window                    ← ventana solo-editor en esa sección (no en notas cifradas)
  ─────────────
  🗑 Delete section  (o Delete note si es la única sección)   ← rojo
```

---

## Ventana sticky (nota flotante)

Botón `⧉` en la toolbar del editor (o `Ctrl+S` para la sección actual, `Ctrl+G` para todas):
- Siempre encima (`alwaysOnTop`). Tamaño 300×300px la primera vez, redimensionable (mín. 200×200).
- **Recuerda dónde la dejaste** (por PC, también tras reiniciar el ordenador): al volver a abrir esa
  sticky (a mano o al arrancar) aparece en su último sitio y con su último tamaño. Si ese sitio quedó
  en un monitor que ya no está conectado, o esa misma sticky ya está abierta, se abre en la posición
  por defecto (en cascada arriba, centrada).
- Frameless con barra de título propia y esquinas redondeadas.
- Modo markdown o modo texto, igual que el editor principal.
- Cambios sincronizados con la ventana principal en tiempo real.
- Se pueden abrir varias a la vez.
- **Plegar/desplegar** (fold/unfold) desde su barra de título: se contrae a una píldora animada
  en la esquina de la pantalla (las píldoras se apilan). La píldora se puede **mover y redimensionar**:
  si la mueves, esa sticky recuerda el sitio y tamaño de su píldora (por PC, también tras reiniciar) y
  las próximas veces se pliega ahí en vez de a la esquina; las que nunca se movieron siguen apilándose
  en la esquina. Para volver a la esquina, arrastra la píldora hasta allí.
- **Recuerda si estaba plegada** (por PC): una sticky configurada para abrirse al arrancar el
  ordenador (Ajustes → Startup) que dejaste plegada vuelve a abrirse **ya plegada** (como píldora, en
  su sitio recordado o en la pila de la esquina, sin animación); al desplegarla recupera su tamaño y
  sitio normales. Si la dejaste desplegada, se abre desplegada. Abrirla a mano desde la app la abre
  siempre desplegada.
- **Cambiar de sección** sin abrir otra ventana: si la nota tiene 2+ secciones, el nombre de la sección
  en la barra de título (con `⌄`, tooltip *Switch section*) abre un desplegable con todas las secciones
  (punto de color + nombre, ✓ en la actual). Teclado: Enter/Espacio/↓ abre, ↑/↓ (cíclico), Home/End,
  Enter/Espacio elige (el foco pasa al contenido de la nueva sección), Escape/Tab cierra. La sticky
  recuerda la sección elegida si se recarga esa ventana (Ctrl+R); no al reiniciar la app: las stickies
  configuradas para abrirse al arrancar vuelven con su sección configurada. Con una
  sola sección llamada `New`/`Main` no se muestra el nombre. En notas cifradas desbloqueadas también
  funciona (todas siguen en solo lectura).

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

## Tour "What's new" / tutorial

- **Cuándo sale:** al arrancar la **ventana principal** (nunca en stickies ni ventanas de sección),
  ~0,7 s después de cargar las notas, si hay diapositivas que **este dispositivo** no ha visto. En
  una instalación limpia (o el primer arranque con el tour) salen **todas** con la cabecera
  **"Discover NoteFlow"**; tras una actualización, **solo las nuevas** con **"New in NoteFlow
  vX.Y.Z"**. Si hay otro modal abierto espera a que se cierre; si la app arrancó oculta en el tray,
  sale cuando se muestra la ventana. El registro de vistas es local (no se sincroniza).
- **Qué es:** popup grande (~880×580, se adapta a ventanas pequeñas) con fondo difuminado. Cada
  diapositiva = un clip corto en bucle de la propia app dentro de un marco de ventana (o, si no hay
  clip, un icono animado con anillos y partículas en el color de la diapositiva) + título + texto
  breve + chips de atajos (`Ctrl`/`⌘` según la plataforma). Diapositivas actuales, en orden: secciones
  en pestañas (el `+` de la barra de pestañas), el Cerebro (con su panel de IA: elegir proveedor y
  preguntar), enlazar secciones + paleta, captura rápida (botón de nota temporal del sidebar,
  `Ctrl+Shift+Space`), sticky / ventanas separadas, kanban, la IA, tus agentes de IA con el CLI (el clip
  abre en un terminal: el agente ejecuta `noteflow add` y la tarea aparece en vivo en la app), sync
  (GitHub / NoteFlow Cloud), el mapa de
  secciones plegado del sidebar (y cambiarlo a fila desde el menú ⋯ del pie), los fragmentos del
  botón del sello, los archivos vinculados (v2.3.0: editar un `.md` o cualquier archivo de texto externo en su sitio, vincularlo desde el `+` o abrirlo desde el sistema), mover las tareas marcadas al final (v2.3.0: Ajustes → Editor) y
  "And much more"
  (rejilla: notas cifradas, plantillas, temas y acentos, tareas con alarma, vista dividida
  `Ctrl+Click`, CLI, importar de Notion y Keep; cada chip se pulsa y despliega 1–2 frases de qué
  hace y dónde se encuentra, uno abierto a la vez). Los clips pueden estar grabados por idioma de la UI.
- **Navegación:** Atrás / Siguiente, puntos de progreso clicables (el activo se estira), contador
  "3 / 13", `←`/`→`, `Enter` (siguiente), `Esc` (cerrar) y **Skip** discreto. La última diapositiva
  termina con **"Start writing"**. Transiciones direccionales con reveal escalonado; con
  `prefers-reduced-motion` todo se queda en fundidos y los clips no se reproducen (se ve su imagen
  fija o el icono sin animar). Mientras está abierto, el resto de la app no recibe teclas (ni
  atajos como `Ctrl+N` ni `Delete`) y el foco se queda dentro del tour.
- **Visto:** cada diapositiva cuenta como vista al mostrarse; cerrar o saltar el tour de arranque
  marca vistas todas las de ese lote (no vuelve a salir).
- **Volver a verlo:** **Ajustes → Tutorial** — botón **Play full tour** y una tarjeta por diapositiva
  (miniatura con el clip, que se reproduce al pasar el ratón salvo con reduced motion; badge
  **New** si aún no se vio;
  versión en que se añadió). Click en una tarjeta → abre el tour en esa diapositiva (navegable a
  todas). También desde la paleta de comandos: **What's new / Tutorial**. El tour se abre encima de
  Ajustes, que sigue abierto debajo.

---

## Nota de bienvenida (primera ejecución)

Para que la app no se abra vacía, la **primera vez** que se ejecuta en un equipo (sin ninguna nota en el
dir de notas y sin sync configurado) crea una nota **"Welcome to NoteFlow"** / **"Bienvenida a
NoteFlow"** (según el idioma de la UI en ese momento; después es contenido normal y no cambia con el
idioma) y la abre, porque es la única. Seis secciones en modo markdown que enseñan lo básico: bienvenida
y atajo global, notas (crear, temporal, paleta, búsqueda, grupos/carpetas, favoritos, abrir en paralelo),
secciones (`Ctrl+T/W/Tab`, renombrar, reordenar, menú), escritura (markdown, `/`, bloque de código,
checklist con tareas que se pueden marcar, `Ctrl+M`), notas flotantes (`Ctrl+S/G`) y sync + IA. Las
teclas salen como en la plataforma (`⌘`/`⌃` en macOS).
- **Nunca se sincroniza** (ni NoteFlow Cloud ni GitHub, tampoco desde el CLI), aunque se edite: si el
  usuario instala la app en otro ordenador que ya sincroniza con su cuenta o su repo, la nota no llega a
  los demás dispositivos ni al remoto, y borrarla no borra nada allí. La propia nota lo dice. No hay
  botón para convertirla en nota normal (para conservar algo, se copia a otra nota); *Duplicate* sí crea
  una nota normal que se sincroniza.
- **No vuelve:** se puede borrar como cualquier nota y no se recrea. Solo sale en una instalación nueva
  (sin ajustes guardados de antes): a quien ya usaba la app y actualiza no le aparece nunca, tenga o no
  notas o sync. Detalle técnico: `architecture.md` (`welcomeNoteSeeded`) y `sync.md` ("Notas
  solo-locales").

---

## Auto-actualización (in-app)

- Al detectar una versión nueva en GitHub, aparece el icono ⬇ en el TitleBar (y un aviso en
  Settings).
- Al pulsarlo, NoteFlow descarga el instalador (el botón muestra el % y, al terminar, un spinner
  "Installing…") y se actualiza **sin popups del SO ni cerrar/reabrir a mano**:
  - Windows: muestra la **barra de progreso nativa del instalador**, se cierra sola y se reabre ya
    actualizada — **sin el popup "cierra la aplicación" ni UAC** (instalador NSIS lanzado con
    `--updated`, que omite ese prompt).
  - Linux, ejecutándose desde su **AppImage**: se reemplaza a sí misma en su ubicación y se relanza.
  - Linux **Debian-based** (instalada con el `.deb`): instala el `.deb` nuevo — pide la contraseña de
    root (diálogo del sistema, inevitable al instalar a nivel de sistema) y se relanza.
  - Linux **Arch y otras distros** (sin paquete publicado para ellas): el botón **abre la página de
    releases en el navegador** para descargar el AppImage a mano (sin aviso de error).
- En Windows, la instalación queda cubierta por la barra de progreso nativa de NSIS. En Linux el
  feedback durante la instalación es el propio diálogo de root (deb) o es casi instantáneo
  (AppImage). Dentro de la app, el botón del TitleBar muestra `%` de descarga → spinner
  "Installing…" hasta que la ventana se cierra.
- Descargas restringidas a hosts oficiales de GitHub (allowlist de seguridad).
- **Versión Microsoft Store** ("NoteFlow - Quick Notes"): sin auto-actualización (la actualiza la
  Store; Settings → About solo lo indica), sin "Launch on system startup", sin CLI (ni "Connect the
  CLI too" ni la skill para agentes): cada panel muestra una explicación y remite a instalar NoteFlow
  desde GitHub. Detalle en `.agents/context/release.md` § Microsoft Store.
- Detalle técnico (elección del asset, allowlist, instalación por plataforma): `.agents/context/patterns.md`
  § "Auto-update in-app".

---

## Settings → Sync: elegir backend y vista general

**NoteFlow Cloud** y **GitHub Sync** son **mutuamente excluyentes**: solo un backend puede estar
activo a la vez.
- **Si aún no sincronizas nada**, la página es una **elección**: arriba "Only on this device — your
  notes are not syncing yet", y las dos opciones como **dos tarjetas iguales**, ninguna preseleccionada:
  para quién es cada una, tres ventajas, una etiqueta de precio discreta (Cloud "€3.99/month", GitHub
  "Free") y su botón ("See NoteFlow Cloud" / "Connect with GitHub"). Las ventajas se leen en paralelo,
  fila a fila: Cloud = sync automática · cifrada (Standard o Private E2EE) · "30-day history of every
  section, restorable in the app"; GitHub = repositorio privado tuyo · cada 5 minutos · "Version
  history kept by Git" (los commits en bruto, en GitHub). Debajo, "Already have NoteFlow
  Cloud? Sign in". Al elegir, se abre ese panel con un enlace "← Sync options" para volver.
- **Si ya usas uno** (Cloud activado, o GitHub conectado), la página es su **vista general** (sin
  selector de backend: cambiarlo casi nunca se hace). De arriba abajo, cabe sin scroll en la ventana
  de Ajustes en el caso habitual:
  1. **Tarjeta de estado**: icono + nombre del proveedor y un **badge con el estado real** (Synced,
     Syncing, Uploading, Not uploaded, Locked, Error…, como el botón ☁ de la titlebar; Cloud sin
     claves aún: "Setup needed"), una línea de datos — Cloud: "Last sync 2 min ago · Real time
     connected · No pending changes" (o "N pending changes"); GitHub: `owner/repo` ↗ (abre el repo en el
     navegador) · "every 5 min" · "Last sync 3 min ago" — y el botón primario **Sync now**.
  2. Dentro de la tarjeta, un **mapa de sync solo informativo** (no se pulsa): Este equipo (con su SO)
     → el proveedor (resaltado; con Cloud el enlace lleva el chip "🔒 encrypted", con GitHub "every 5
     min") → Otros dispositivos ("in real time" con Cloud) y el CLI noteflow ("connected" / "not
     connected", atenuado si no). Debajo de Este equipo, en discontinuo, el backend que no está en uso:
     GitHub "paused · manual mirror" (solo si está conectado) o NoteFlow Cloud "not active". Los
     enlaces se ven discontinuos si el proveedor está bloqueado o con error.
  3. Si Cloud necesita algo (crear las claves, desbloquear con la passphrase), aparece **justo debajo
     de la tarjeta**. Ahí sale también, lo primero, el aviso ámbar **"Paused — the notes on this device
     came from … Nothing syncs with … until you choose how to continue."** con el botón **Choose…**
     cuando las notas vienen de otro repo o de otra cuenta (ver "GitHub Sync" → "Conectar a otro
     repositorio"): el badge de la tarjeta dice entonces **Action needed**, **Sync now** queda
     deshabilitado y el mapa pinta los enlaces discontinuos.
  4. **"Security and data"** (Cloud) / **"Repository and data"** (GitHub), una lista de filas:
     - Cloud: **Standard encryption** / **Private encryption (E2EE)** con su botón "Switch to private
       mode" / "Switch to standard mode" (el formulario se abre en la propia fila; en privado también
       **Lock**), **Version history** ("30 days per section, restorable from each section's menu",
       badge "Included") y **noteflow CLI**.
     - GitHub: **Your repository** ("In your GitHub account — NoteFlow's servers keep no copy" → "Open
       on GitHub"), **History in Git** ("Every change uploaded from here is a commit" → "View commits",
       abre los commits del repo) y **noteflow CLI**.
     - En ambos, justo antes de **noteflow CLI**: **Local copies** → "Open local copies", solo si
       existe alguna copia de "Use only the notes from …" (sin backend activo, la misma opción sale al
       pie del selector o del detalle). Y **noteflow CLI** deshabilita "Connect the CLI too" (con
       "Available once you choose what to do with the notes on this device." debajo) mientras haya que
       elegir.
  5. **"Other providers"**: con Cloud activo y GitHub conectado, **GitHub Sync "Paused"**
     ("owner/repo · settings kept") con **Mirror to GitHub** (pide confirmación) y **Disconnect**; con
     Cloud activo y sin GitHub, **GitHub Sync "Not connected"** ("Your notes in a repository of your
     GitHub account. To use it, turn off NoteFlow Cloud.") → **View GitHub Sync** abre su detalle sin
     apagar Cloud, para curiosear: qué ofrece (los puntos de la tarjeta del selector) y el aviso
     "NoteFlow Cloud is in use" (para cambiar, apaga Cloud primero al pie de la vista general; no borra
     nada). No hay botón de conectar mientras Cloud está activo; si Cloud se apaga, ese detalle pasa a
     ser el formulario de conexión normal. Con GitHub activo, **NoteFlow Cloud "Inactive"**
     ("Encrypted, with 30-day history. Turning it on pauses GitHub Sync.") → **See NoteFlow Cloud** abre
     el detalle de Cloud (plan, inicio de sesión, Enable) con "← Sync options" para volver.
  6. **Pie**: "Turning it off deletes nothing: your notes stay on this device." (con GitHub conectado:
     "…stay here and GitHub Sync resumes.") + **Turn off NoteFlow Cloud** en rojo; con GitHub,
     "Disconnecting deletes nothing: your notes stay here and in the repository." + **Disconnect
     GitHub**. Es cierto: apagar Cloud no borra notas locales ni las de la nube, y desconectar GitHub
     no toca las notas ni el repo. Al apagar Cloud te quedas en su detalle (para volver a activarlo);
     al desconectar GitHub, en su formulario de conexión.

**noteflow CLI — "Connect the CLI too".** La fila **noteflow CLI** de la lista de la vista general da
al CLI `noteflow` su propio acceso al backend activo, para que lo que se escribe desde la terminal o por
agentes de IA también se sincronice. En reposo es compacta (badge **Connected** / **Not connected**,
una línea y el botón); el flujo se despliega en la misma fila:
- **Cloud:** el botón envía un código al email de la cuenta de la app; aparece un campo inline para
  el código ("Connect CLI", "Send a new code", Cancel; código inválido/caducado se muestra inline). El
  CLI inicia **su propia** sesión (la app sigue con la suya) y no hace pull. Si la cuenta usa cifrado
  privado (E2EE), un aviso ámbar explica que el CLI solo sincroniza con la passphrase (prompt en cada
  ejecución o `NOTEFLOW_CLOUD_PASSPHRASE`).
- **GitHub:** sin código; antes de copiar el token, un diálogo avisa de que el CLI lo guarda en
  base64, sin el cifrado del llavero del sistema ("Copy token").
- **Conectado:** "Connected with email" / "Connected with owner/repo" + **Disconnect CLI**, que solo
  quita lo del CLI (nunca la conexión de la app). Si el CLI ya estaba conectado desde la terminal,
  sale igual como conectado. En la versión de la Microsoft Store (sin CLI) la fila solo lo explica.
  Detalle técnico en `.agents/context/patterns.md` § CLI.

## NoteFlow Cloud (Settings → Sync)

> **Fusión por secciones y copias de conflicto:** si editas una nota **en la app con NoteFlow Cloud
> activado** sin conexión (o antes del primer sync del arranque) y mientras tanto otro dispositivo
> cambia **otras secciones** de esa nota, al reconectar se **combinan**: te quedas con tus secciones
> y con las suyas, sin copia; también las secciones nuevas que añadió cada uno. Si los dos tocasteis
> los datos de la nota (lo normal en cuanto cambian etiquetas, que salen del contenido), el título, el
> grupo/carpeta y los nombres de sección los decide el otro dispositivo; las etiquetas se suman, y una
> sección **oculta a la IA** o una nota **favorita** en cualquiera de los dos lados sigue oculta/favorita.
> Si los dos cambiasteis **la misma sección**, se **fusiona línea a línea** dentro de la nota (sin
> nota aparte): lo que cada uno añadió o cambió en líneas distintas se combina (p. ej. una tarea
> añadida al final aquí y otra allí → quedan las dos). Solo si tocasteis **las mismas líneas** de
> forma distinta, la sección guarda **las dos versiones** entre marcas legibles (`> ⚠️ Sync conflict
> (2026-11-06 09:38) — version from <nombre del equipo que fusionó>:` / `> ⚠️ Sync conflict — version
> already synced:` / `> ⚠️ End of sync conflict`, en español si la app está en español; nombran al
> equipo y la hora, no "este dispositivo", porque el texto se sincroniza a todos) y la tarjeta del botón de sync lo avisa
> ("look for the ⚠️ markers"): te quedas con la buena y borras las marcas. Si un dispositivo no
> conoce la versión anterior de la sección (notas sincronizadas antes de esta versión), la fusión
> es una unión: no se pierde ninguna línea, pero una línea que el otro borró puede volver. Una nota
> **cifrada** no se puede combinar: gana la del servidor y tu versión entera va a una copia de
> conflicto "<título> (conflict copy AAAA-MM-DD HH:mm)" (sigue cifrada con la misma contraseña). Si la borran (la nota o una sección) en otro dispositivo mientras
> tú la editabas, tu versión se conserva y sigue visible en la nota (o va a una copia). La copia se sube como cualquier nota y se avisa en la
> tarjeta del botón de sync del titlebar. El primer sync tras actualizar la app relee toda la nube una
> vez para aplicar ya esta regla a todas las notas (también a ediciones offline hechas antes de ese
> primer sync). **El CLI con Cloud hace lo mismo** (`noteflow pull`/`push` y la subida tras cada
> comando): fusiona por secciones, sus subidas llevan la versión sobre la que se editó, la primera
> ejecución tras actualizarlo relee la nube una vez, y fusiona igual las secciones que cambiaron los
> dos (si quedan marcas imprime `Merged with conflicts: "<título>" — both versions kept, look for the
> ⚠️ markers`). **No cubre:** notas que ese
> cliente aún no tiene sincronizadas con la regla nueva (sin base: rigen las reglas de antes); un
> `noteflow touch` del CLI hecho antes de esa primera relectura (no sabe qué secciones cambiaste, así
> que una sección que el otro dispositivo tocó puede quedar con marcas de conflicto de más); y un `noteflow cloud pull`
> sobre una edición offline de la app en una nota que el CLI aún no tiene sincronizada con la regla
> nueva. El GitHub Sync tiene su propia
> versión (ver "GitHub Sync" → "Si otro dispositivo cambió la nota"). Puede salir una
> copia de más (otro cliente que formatee distinto el YAML, notas cifradas, un `note.md` con YAML que
> el CLI no sabe leer) y la copia conserva favorito/caducidad/alarmas (pueden sonar dos veces).

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
- **Sin sesión:** el **detalle del plan**: "What's included" (cifrado, sync automático, Estándar o
  Privado E2EE, historial de versiones de cada sección —30 días, restaurar con un clic—, sin repo; y
  "si cancelas, tus notas siguen en tu equipo") y una **caja de plan** con
  el precio mensual y debajo el anual ("or €39.99/year · save 16%"; el periodo se elige en la página
  de pago), y el **inicio de sesión ahí mismo**
  (correo → código), que sirve igual para suscribirte que para entrar si ya pagas. El Bundle va como
  una línea al pie ("Also interested in AI? NoteFlow Bundle brings Cloud and AI together for
  €7.99/month" → "Choose the Bundle").
- **Sin claves (`no-keys`):** con la entitlement `cloud`, elección de modo con dos cards (Standard
  preseleccionada); sin ella, en su lugar sale el bloque de planes (ver "Gating por suscripción").
  Standard = un click ("Enable") y directo a desbloqueado. Private = crear **passphrase**
  (input + confirmación, mínimo 8 caracteres) → se muestra el **recovery code UNA sola vez** en
  un bloque ámbar destacado (copiable, con aviso rojo: perder passphrase + recovery = notas
  irrecuperables, NoteFlow no puede resetearlas) → botón "I have saved my recovery code" para
  continuar. El código no vuelve a mostrarse jamás.
  **Cloud ya habilitado pero sin claves aún:** estado nuevo del primer uso cuando Cloud se activa solo
  (al iniciar sesión o al suscribirte con el plan Cloud): el panel muestra estas mismas cards de modo
  (onboarding), Cloud ya cuenta como backend activo y **GitHub Sync ya está en pausa**; la sync con la
  nube arranca en cuanto configuras las claves.
- **Bloqueado (`locked`):** en modo managed el panel se desbloquea solo (spinner "unlocking…",
  reintento silencioso cada 10 s — típico de un arranque offline); en modo private, un único
  input acepta **passphrase o recovery code** → "Unlock".
- **Desbloqueado y activo:** la vista general (arriba): cambios sin subir en la línea de datos de la
  tarjeta (entonces el resultado no dice "Already up to date"), **Sync now** (ciclo completo: pull +
  reintento de lo pendiente de subir; resultado tipo GitHub), **Lock** en la fila de cifrado (solo en
  modo private — en managed se re-desbloquearía solo) y **Turn off NoteFlow Cloud** en el pie.
  **Desbloqueado sin activar:** el detalle, con "Sync disabled" + badge del modo, **Enable sync** (o
  el bloque de planes) y Lock. En managed,
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
  y el botón **Enable sync**. En ambos casos, en su lugar, el **mismo detalle del plan** que sin
  sesión, con **"Continue to payment"** en la caja (abre el checkout de Lemon Squeezy en el navegador;
  el plan se activa solo tras pagar); delante de Enable, además, "requires subscription". Si ya pagas
  AI, la caja es la **mejora a Bundle** ("+€2.00/month", "Switch to Bundle" → confirmación con el
  prorrateo), nunca Cloud suelto. El panel Cloud no tiene párrafo de introducción propio. **Unlock, Sync now,
  Disable y Lock no se bloquean por suscripción** (la nube solo rechaza escrituras), pero cuando la app
  confirma que la suscripción caducó **desactiva Cloud sola** (ver § "Panel de IA", "Se activa solo
  lo que tienes pagado"): tus notas siguen en local y los cambios sin subir se quedan pendientes para
  cuando vuelvas a suscribirte. Mientras Cloud siga activo y la nube rechace las subidas por falta de
  suscripción, "Sync now" baja lo que haya pero **muestra el error de suscripción** en vez de dar todo
  por bueno.
- Antes de activar con GitHub Sync conectado, aviso ámbar: "GitHub Sync quedará en pausa" (solo
  cuando activar Cloud está realmente al alcance, es decir con la entitlement `cloud`). Este aviso es
  del **Enable manual**: la **auto-activación** (al iniciar sesión o al suscribirte con el plan Cloud)
  pausa GitHub Sync **sin aviso previo**.

Detalle técnico (jerarquía de claves, modos managed/e2ee, motor de sync):
`.agents/context/monetization.md` § 4.

---

## Historial de versiones de una sección (NoteFlow Cloud)

Con NoteFlow Cloud, cada sección guarda **versiones anteriores durante 30 días**, sin que el usuario
haga nada: el servidor guarda como mucho una cada 10 minutos mientras se edita, y **siempre** una justo
antes de borrar la sección, de un recorte grande (vaciarla o quitarle más de la mitad) y de una
restauración. Vale para lo que se edita desde cualquier sitio (app, CLI, móvil). Es la ventaja de
Cloud frente al GitHub Sync gratuito: historial **por sección, dentro de la app y restaurable**, en
vez de commits en bruto en GitHub.

- **Dónde se abre:** **"Version history"** en el `⋯` del editor (sección activa) y en el menú del
  click derecho de la pestaña de una sección. Solo en la ventana principal, y no en notas con
  contraseña, solo locales ni vinculadas, ni en ventanas sticky o de sección.
- **Qué muestra:** un modal con dos columnas.
  - **Izquierda — línea de tiempo** agrupada por días ("Today", "Yesterday", "Wed, Nov 12"): arriba
    **"Current version"** (lo que tiene ahora la sección) y debajo cada versión con **dos horas**,
    "11:25 → 16:13" (cuándo se escribió ese texto → cuándo se sustituyó y se guardó la copia; la
    segunda más tenue y con fecha corta si cae otro día, "18:02 → Nov 16, 09:00"; tooltip "Written
    11:25, replaced 16:13"), su tamaño y, si no fue una edición normal, una etiqueta: "Before a big
    cut", "Before it was deleted" o "Saved before a restore". Los días agrupan por la hora de
    escritura. Flechas ↑/↓ para moverse; Esc cierra.
  - **Derecha — la versión elegida** ("Written Nov 16, 11:25 · replaced Nov 16, 16:13"), con un
    conmutador **Changes | Preview**:
    *Changes* = diff por líneas contra el texto actual ("Only in this version" / "Added since", las
    líneas iguales plegadas en "N unchanged lines"; con demasiados cambios muestra la versión tal cual);
    *Preview* = la versión tal como era (renderizada, o monoespaciada en Modo texto). Avisos si la
    versión es idéntica a la actual ("Restoring it would change nothing") o está vacía.
  - **Pie:** "30 days of history · encrypted like your notes" y los botones **Copy**, **Restore as
    new section** y **Restore this version**.
- **Restaurar ("Restore this version"):** antes de sustituir nada, guarda el texto actual en el
  historial ("Saving the current text…"), así que restaurar nunca pierde lo que había. Luego la
  sección cambia de golpe, como **un solo paso de Ctrl+Z** (se deshace con un Ctrl+Z), y se sincroniza
  como cualquier edición. Aviso breve en el editor: "Restored the version from Nov 15, 13:50".
  - Si el texto actual **no se pudo guardar** antes (sync de Cloud desactivado en este equipo, cambios
    aún sin subir, sin conexión, sin suscripción, claves bloqueadas…), no sustituye en silencio: diálogo
    "The current text couldn't be saved to the history" con el motivo, que recomienda **Restore as new
    section** (conserva los dos textos) u ofrece **Replace anyway**.
- **"Restore as new section":** crea una sección nueva justo detrás de la original, en el mismo modo
  (texto/markdown), llamada "<Nombre> (version from Nov 15, 13:50)"; la original no se toca.
- **Estados sin Cloud utilizable:** sin cuenta o sin plan Cloud, el panel **explica la función** ("Go
  back to any earlier version" — 30 días de historial por sección, cifrado) con el botón **"View
  NoteFlow Cloud"** (Ajustes → Sync, en el detalle de Cloud). Otros estados: aún sin versiones ("No
  earlier versions yet — they're saved on their own while you edit with NoteFlow Cloud"), claves de
  Cloud bloqueadas ("Open Sync settings"), sin conexión (Retry), plan sin verificar, nota sin historial
  (solo local / con contraseña) y versión caducada (más de 30 días: la lista se refresca).
- **Límites:** 30 días, hasta 100 versiones / 20 MB por sección. Renombrar la nota deja de mostrar el
  historial anterior a ese cambio de nombre. Desde la terminal: `noteflow history` (ver la skill
  `noteflow-cli`).

Detalle técnico: `.agents/context/monetization.md` § 4 "Historial de versiones" y
`.agents/context/patterns.md` § "Historial de versiones: restaurar una sección".

---

## GitHub Sync

Settings → Sync ("Connect with GitHub" en la elección inicial; conectado, su vista general — ver
"Settings → Sync: elegir backend y vista general").

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
- **Si otro dispositivo cambió la nota** en GitHub desde la última vez que este la sincronizó (y
  aquí también se editó), el push **no la pisa**: la app hace un sync enseguida y **fusiona** las dos
  versiones como NoteFlow Cloud — por secciones y, dentro de una sección que cambiasteis los dos, por
  líneas (las dos versiones entre marcas ⚠️ solo si tocasteis las mismas líneas, con el aviso ámbar
  de la tarjeta del botón de sync) — y sube el resultado. Solo si no se puede fusionar (nota cifrada,
  `note.md` ilegible) se queda con la versión de GitHub y guarda la tuya como nota nueva "<título>
  (conflict copy AAAA-MM-DD HH:mm)"; una sección que se borró en GitHub mientras la editabas aquí se
  borra y tu texto va a una copia con solo esa sección. Lo mismo si borras una nota (o una sección) que
  cambió en GitHub: no se borra allí y vuelve en el siguiente sync. Si solo cambió el otro lado, todo
  sigue como siempre. Con NoteFlow Cloud activado GitHub es un espejo y no hace esto. El CLI
  (`noteflow push` y el push de cada comando) tampoco pisa y **fusiona igual** (con marcas imprime
  `Merged with conflicts: "…"`); solo lo que no se puede fusionar acaba en copia de conflicto
  (`Conflict: local changes kept as "…"`).
- Se sincronizan notas + `groups.json`, `folders.json`, `section-colors.json`, `note-order.json`,
  `templates.json`, `snippets.json` (fragmentos del toolbar), `ui-settings.json` (apariencia y ajustes
  del editor).
- **Conectar a un repo que ya tiene sus grupos/carpetas** (usado antes por otro dispositivo, o tras
  perder el estado de sync): los grupos, carpetas, plantillas y fragmentos de este dispositivo **se
  unen** con los del repo (si coinciden en id, gana la versión del repo) y la unión se sube — no se
  pierde nada. La apariencia, los colores de sección y el orden de notas toman los del repo. En ambos
  casos la versión local que se reemplazó se guarda antes en `<userData>/github-metadata-backups/<fecha>/`
  (sin aviso en la UI). Ya sincronizado, un cambio en el repo gana como siempre. El CLI hace lo mismo
  en el `pull` (tras `noteflow login`) pero solo con **grupos y carpetas** (por GitHub no sincroniza
  plantillas ni fragmentos), con la copia en `<dir de ajustes del CLI>/github-metadata-backups/`, y
  avisa de que un `noteflow push` suba la unión.
- El repositorio se crea como **privado** automáticamente si no existe.

### Conectar a otro repositorio (las notas vienen de otro sitio)
La app recuerda de qué repo vienen las notas de este dispositivo (el "origen", local, en `settings.json`;
desconectar no lo olvida). Si conectas un repo **distinto** y hay notas que se sincronizarían (la nota
de bienvenida, solo-local, no cuenta), **no sube ni baja nada** y abre un diálogo "Your notes came from
somewhere else" con el repo anterior → el nuevo y tres opciones, **ninguna preseleccionada** (se elige
una y luego "Continue"):
- **Merge both** — lo de siempre: tus notas suben al repo nuevo y bajan las suyas.
- **Use only the notes from <repo>** — tus notas se **mueven a una copia en este ordenador** (nada se
  borra ni se sube; con sus grupos, carpetas, orden, colores de sección, plantillas y fragmentos; la
  apariencia se queda) y se bajan las del repo nuevo. Las copias se abren desde Ajustes → Sync → fila
  **"Local copies"** → **"Open local copies"** (aparece cuando existe alguna; sin backend activo, al pie
  del selector o del detalle). Si no se pueden mover (p. ej. un programa tiene
  bloqueada la carpeta), no se baja nada, tus notas quedan intactas y el diálogo muestra el error.
- **Cancel** — desconecta el repo nuevo; todo queda como estaba.
"Decide later" (o Escape) solo cierra el diálogo: mientras tanto el sync está **en pausa** (botón de la
titlebar en ámbar; en Ajustes → Sync la tarjeta de estado dice "Action needed", "Sync now" queda
deshabilitado y bajo la tarjeta hay un aviso con "Choose…" para reabrirlo; sobrevive a reiniciar la app). Reconectar al **mismo** repo (aunque lo hayas renombrado) o conectar un repo cuando no hay notas
sincronizables no pregunta. La primera conexión (sin origen guardado) tampoco. Con NoteFlow Cloud
activado GitHub nunca pregunta (el dueño de las notas es la cuenta de Cloud). También lo detecta al
arrancar si el CLI dejó la app conectada a otro repo. Aún no se puede restaurar una copia desde la app.

**Lo mismo con NoteFlow Cloud (cambiar de cuenta).** La app recuerda también con qué **cuenta** de
NoteFlow se sincronizaron las notas de este dispositivo. Si inicias sesión con **otra** cuenta y Cloud se
activa (solo, porque la cuenta lo tiene pagado, o a mano) habiendo notas que se sincronizarían, **no sube
ni baja nada** y abre el mismo diálogo (cuenta anterior → cuenta actual, por email):
- **Merge both** — tus notas suben a la cuenta actual y bajan las suyas.
- **Use only the notes from <email>** — tus notas pasan a la copia local (Ajustes → Sync → "Local
  copies" → "Open local copies") y se bajan las de la cuenta. Si GitHub Sync estaba conectado, **se desconecta**
  (el diálogo lo avisa): su repo tenía las notas que acabas de apartar.
- **Cancel** — "Turn off NoteFlow Cloud on this device": apaga Cloud, sigues con la sesión iniciada y tus
  notas quedan como estaban. No vuelve a preguntar hasta que enciendas Cloud tú (o vuelvas a iniciar
  sesión).
Mientras está pendiente: botón de la titlebar en ámbar ("Action needed"); en Ajustes → Sync la tarjeta
de estado de la vista general dice "Action needed" con el aviso y "Choose…" debajo, "Sync now" queda
deshabilitado, "Mirror to GitHub" (fila "GitHub Sync · Paused") también, con el mismo aviso como
tooltip ("Paused — the notes on this device came from … Nothing syncs with … until you choose how to
continue."), y "Connect the CLI too" (fila "noteflow CLI") queda deshabilitado con la explicación debajo
(en GitHub igual mientras su elección está pendiente). Volver a entrar con la **misma** cuenta no
pregunta.

**Cruce entre los dos.** "Use only the notes from …" de un backend sustituye las notas, así que el otro
deja de reconocerlas: tras usar solo las del repo de GitHub, encender Cloud con tu cuenta de siempre
**pregunta** si hay notas (sin notas, se re-adopta solo); y al revés, tras usar solo las de la cuenta de
Cloud, reconectar el mismo repo pregunta. El diálogo dice entonces que tus notas "now come from" la otra
sincronización.

**Un origen por carpeta de notas.** El origen guardado es el de la carpeta de notas normal; si arrancas
con otra carpeta (`NOTEFLOW_NOTES_DIR`), allí no se pregunta ni se guarda nada, y al volver a la carpeta
normal se pregunta si toca.

### Panel de sync
- Vista general: estado real, repo vinculado (↗), cadencia y última sync, mapa informativo.
- "Sync now" para sync manual (primero reintenta las subidas/borrados pendientes del journal, luego
  pull; deshabilitado mientras haya que elegir qué hacer con las notas de otro repo) · "Disconnect
  GitHub" en el pie para desconectar.
- **"Mirror to GitHub" / "Espejar en GitHub"** — botón de la fila "GitHub Sync · Paused" de la vista
  general de Cloud, así que **solo con NoteFlow Cloud activado** (es entonces cuando GitHub queda en pausa como espejo de solo
  escritura y el repo se va quedando obsoleto: no le llegan los borrados ni las notas que Cloud
  trae de otros dispositivos). Pide confirmación y deja el repo como **copia exacta** de lo que hay
  en este dispositivo: sube lo que falte o difiera y **borra del repo** lo que ya no exista aquí
  (nunca toca el README ni ficheros ajenos al formato). Las notas locales no se modifican. Al
  terminar informa de cuántos ficheros subió y borró.

### Privacidad
- El repo se crea **privado** si no existía (uno que ya existía conserva su visibilidad, por eso la
  app no lo llama "privado"). Token cifrado con el SO (`safeStorage`), nunca sale de la máquina.
- Sin servidor intermedio — comunicación directa con la API de GitHub. Sin telemetría.

---

## Cuenta NoteFlow (Settings → Account)

El apartado de Ajustes se llama **"Account"/"Cuenta"** (id interno `'account'`; hasta 2026-11 se llamaba
"Subscription"/"Suscripción"). Empieza por **tu plan**, no por precios:
- **"Your plan: Free"** con badge **Current plan** y lo que incluye gratis: notas ilimitadas en tu
  equipo, sync con GitHub, el Cerebro y notas relacionadas con IA local, chat con tu propia clave u
  Ollama; sin sesión, además, **"You don't need an account for any of this."**
- Debajo, **"Optional upgrades"** como **filas compactas** (no tarjetas grandes): NoteFlow Cloud
  (€3.99/month), NoteFlow AI (€5.99/month) y NoteFlow Bundle (€7.99/month, "saves €1.99/month vs.
  buying them separately"), cada una con su precio pequeño y **"View"**, que lleva a su detalle: Cloud
  y Bundle → Ajustes → Sync con el detalle de Cloud abierto (el Bundle ya elegido); AI → Ajustes → IA
  con el detalle de NoteFlow AI. Cifras de `src/lib/subscriptionPlans.ts` (`.agents/context/monetization.md`
  § visión), en el formato del idioma. Todo lo gratuito sigue funcionando sin cuenta.
- **Sin sesión**, al pie: "Already have a subscription?" + el inicio de sesión (el mismo que en los
  detalles de los planes).
- **Si ya pagas un plan** (Cloud o AI): "Your plan: NoteFlow Cloud" con badge **Active** y "Manage
  subscription", y **ninguna tarjeta de precio**. En su lugar, una fila plegada **"Add NoteFlow AI to
  your plan"** (o Cloud) con chevron; al abrirla: una frase de valor, "Your subscription becomes the
  Bundle (Cloud + AI): you never pay for two subscriptions", el diferencial (**"+€4.00/month"** desde
  Cloud, "+€2.00/month" desde AI, y el anual), "€7.99/month in total · you only pay the prorated part
  of the current period" y **"Switch to Bundle"** (la confirmación de abajo) o **"Not now"** (la
  pliega). Si tu suscripción no se puede cambiar desde la app (p. ej. una regalada), la fila ofrece el
  otro producto como suscripción aparte.
- **Con los dos** (Bundle): "Your plan: NoteFlow Bundle" y nada que vender.

- **Sign-in sin contraseña:** email → "Send code" → código de acceso por email (8 dígitos) → "Verify &
  sign in" (misma UX de código que el Device Flow de GitHub). "Use a different email" vuelve atrás.
- **Código incorrecto:** el error NO sale en la caja roja de arriba, sale **pegado al input**
  (icono ⚠ + "That code doesn't match, or it has expired…"), el input se pone con borde rojo y da
  un **shake** corto, y su contenido queda **seleccionado** para reteclear directo; el error se
  borra en cuanto escribes. Junto a "Verify & sign in" hay **"Resend code"** (con cuenta atrás de
  60 s tras cada envío) para pedir otro código sin volver al paso del email — al llegar el nuevo,
  línea "New code sent — check your inbox.". Los mensajes de error vienen **traducidos** (el
  proceso main manda un código de error, no texto en inglés).
- **Con sesión:** muestra el email, la tarjeta "Your plan" (con **"Manage subscription"** si aplica,
  ver abajo), las mejoras que tocan, botón "Refresh" (relee las suscripciones), "Sign out" y, separado
  al final, **"Delete account"**.
- **"Manage subscription" / "Gestionar suscripción":** solo si la cuenta tiene (o tuvo) una
  suscripción pagada con Lemon Squeezy — en cualquier estado (activa, cancelada, con pago fallido o
  expirada: sigue habiendo facturas); las suscripciones regaladas a mano (comps) no lo ven, y tampoco
  sale mientras el plan está "Couldn't check". Debajo, el hint "Cancel, change plan, update your payment
  method or download invoices. Opens in your browser.". Al pulsarlo (spinner mientras tanto) abre en el
  navegador el **portal de cliente de Lemon Squeezy** ya identificado; si la app no consigue ese enlace
  (servidor sin desplegar, sin red, LS caído…) abre la página de facturación genérica de la store y
  avisa en una línea: "…sign in there with the email you used to subscribe." Es la única vía en la app
  para cancelar o cambiar de plan (antes solo por los correos de LS).
- **Plan aún sin comprobar:** si la app no ha podido consultar tu plan todavía (arranque sin red,
  servidor caído) y no tiene uno guardado de la última vez, la tarjeta "Your plan" y los detalles de
  IA y Cloud muestran **"Couldn't verify your plan yet — Retry"** en vez de cualquier precio, mejora o
  "requiere suscripción" (nunca te ofrece pagar algo que quizá ya pagas). La
  app reintenta sola (cada vez más espaciado, al volver de suspensión y al recuperar la red);
  mientras, NoteFlow AI se deja usar (el servidor decide). La última respuesta buena se recuerda,
  así que tras reiniciar el plan se ve al momento.
- **Llavero bloqueado:** si el sistema no deja descifrar la sesión guardada (Linux antes de
  desbloquear el llavero, Keychain denegado en macOS), **no** se cierra sesión: aviso ámbar
  "Couldn't unlock your saved session — your system keychain may be locked…" con Refresh para
  reintentar o Sign out. Se recupera sola en cuanto el llavero se desbloquea.
- **Sign out** cierra solo la sesión de este equipo (otros dispositivos y el CLI siguen dentro).
- **"Delete account" / "Eliminar cuenta"** (solo con sesión): botón rojo con el hint "Permanently
  deletes your NoteFlow account and your NoteFlow Cloud data, and cancels any active subscription.
  Notes on this computer are kept.". Pide confirmación en un modal ("Delete your NoteFlow
  account?" → "Delete permanently"); mientras borra, spinner "Deleting account…" y el resto de
  botones bloqueados. Si va bien, se cierra la sesión, **NoteFlow Cloud se desactiva** en este
  ordenador (las notas locales no se tocan) y queda un aviso verde "Your NoteFlow account has been
  deleted. Notes on this computer were kept." sobre el formulario de inicio de sesión. Los fallos
  salen bajo el botón y la sesión sigue como estaba: sesión no válida ("Sign out, sign in again and
  retry"), suscripción que no se pudo cancelar ("…so nothing was deleted"), o error genérico/de red
  (reintentar). Mismo comportamiento que la app de Android.
- **Pasarse al Bundle teniendo ya AI o Cloud:** si pagas **una** de las dos con una suscripción de
  Lemon Squeezy, "Switch to Bundle" no abre checkout, sino una **confirmación dentro de la app**
  ("Upgrade to NoteFlow Bundle?") que explica que es un **cambio de plan de tu suscripción actual, no
  una segunda**, y que se **prorratea** (se abona lo no usado del periodo actual y se cobra ya solo la
  diferencia a la tarjeta guardada; desde la próxima renovación, precio del Bundle con el mismo ciclo
  mensual/anual; la fecha de renovación no cambia). "Confirm upgrade" lo aplica y el Bundle se activa
  en unos segundos. No aparece con una comp, con las dos suscripciones sueltas ni con el plan sin
  verificar. Igual en los detalles de IA y de Cloud. Tras pagar AI, **el proveedor NoteFlow AI se activa
  solo** en Settings → AI.
- **Builds sin backend configurado** (`cloudConfig.ts` vacío — no es el caso de las builds
  actuales): el panel solo muestra "NoteFlow account services aren't available in this build yet."
- Privacidad: la sesión (refresh token cifrado con `safeStorage`) vive en el proceso main y nunca
  llega al renderer; detalle técnico en `.agents/context/monetization.md`.

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

Detalles de los imports externos: el contenido entra en **modo markdown** (no en modo texto); las notas **sin
contenido se omiten** (las filas de BD / páginas título-solo de Notion no ensucian); subcarpetas →
grupos (1er nivel) + folders (anidados, aplanados a 2 niveles); imágenes y `.csv` de Notion no se
importan (v1). Implementación en `.agents/context/patterns.md` (importadores + IPC).

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
| `Ctrl+'` | Fijar / desfijar sidebar (fijado ⇄ flotante; en la vista cerebro, mostrar/ocultar sus notas) |
| `Ctrl+Click` | Abrir nota en paralelo (sobre un tag de sección: esa sección en un panel nuevo) |
| `Alt+←/→` (macOS `⌘[` / `⌘]`) · botones laterales del ratón | Atrás / adelante entre notas y vistas |

### Secciones
| Atajo | Acción |
|---|---|
| `Ctrl+T` | Nueva sección |
| `Ctrl+W` | Eliminar sección |
| `Ctrl+Tab` | Siguiente sección |
| `Ctrl+Shift+Tab` | Sección anterior |
| `Ctrl+A` | Seleccionar todo (secciones en la vista de nota, notas visibles en la vista de contenido) |
| `↑ ↓` / `← →` / `Intro` | Vista de contenido: cambiar de nota / de sección / abrir en el editor |
| `← → ↑ ↓` / `Intro` / `F2` | Vista de nota: mover el foco entre tarjetas / abrir la sección / renombrarla |
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
| `Ctrl+M` | Alternar modo texto / modo markdown (también `Ctrl+Shift+E` con el foco en el editor) |
| `Alt+↑` / `Alt+↓` | Mover el ítem de lista (con sus subítems) |
| `Tab` / `Esc` (con sugerencia de IA visible) | Aceptar / descartar el autocompletado con IA |
| `Ctrl++` / `Ctrl+-` / `Ctrl+0` | Fuente: aumentar / disminuir / reset |

### Tablas
Con el cursor o una selección de celdas en una tabla (`Mod` = `Ctrl`, `⌘` en macOS).

| Atajo | Acción |
|---|---|
| `Alt+↑` / `Alt+↓` | Mover la fila arriba / abajo |
| `Alt+←` / `Alt+→` (macOS `⌘⌥←/→`) | Mover la columna a la izquierda / derecha |
| `Mod+Enter` | Insertar una fila debajo |
| `Mod+Shift+Enter` | Insertar una columna a la derecha |
| `Mod+D` | Duplicar la fila |
| `Mod+Shift+Backspace` | Eliminar la(s) fila(s) seleccionada(s) |
| `Alt+Shift+Backspace` | Eliminar la(s) columna(s) seleccionada(s) |
| `Backspace` / `Delete` | Vaciar las celdas seleccionadas |
| `Tab` / `Shift+Tab` | Celda siguiente / anterior (`Tab` en la última celda añade una fila) |

---

## Persistencia y almacenamiento

- Notas en `~/noteflow-notes/` (Windows/macOS) / `~/.local/share/noteflow-notes/` (Linux).
- Junto a ellas: `groups.json`, `folders.json`, `section-colors.json`, `note-order.json`,
  `templates.json`, `snippets.json`, `ui-settings.json` (todo sincronizable).
- Auto-save con debounce tras cada cambio.
- Formato v2 (carpeta por nota): `note.md` con el frontmatter YAML + un `.md` por sección.
- Carpeta configurable desde Settings → Data → "Choose notes directory".
- Ajustes locales (idioma, autostart, estado de UI, token de sync) en `settings.json` del userData.
  La apariencia (tema, fuente, acento, colores del editor) y los ajustes del editor (tamaño/familia
  de fuente, ancho legible, índice flotante) se sincronizan vía `ui-settings.json`; la escala de UI y el idioma
  siguen siendo por dispositivo.
