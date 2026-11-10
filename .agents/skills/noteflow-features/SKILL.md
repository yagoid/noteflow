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
│  9 notes · 31 sections             ⋯   │                            │
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
- **Despliegue:** si dejas el ratón quieto un instante (~0,15 s) sobre la línea, flota encima de la
  lista el mapa de esa nota con los nombres (las celdas salen de sus tramos). Barrer la lista con el
  ratón no lo abre. Se cierra al salir de la fila, al hacer scroll o al teclear. Sus celdas tienen la
  preview de sección al hover y el menú de sección con clic derecho; **clic en una celda** abre la nota
  en esa sección y el mapa flotante se convierte en el de la nota, sin cortes (Ctrl/Cmd+clic → esa
  sección en un panel al lado).
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
- **Clic en la fila** (fuera de las celdas): abre la nota en el editor **en su primera sección**,
  tenga las secciones que tenga (la vista de nota ya no se abre al pulsar la nota; ver "Cómo entrar" en
  [Vista de nota](#vista-de-nota-note-overview)). Una nota cifrada y bloqueada se abre sin más (pide
  desbloquear).
- **Buscando:** las notas cuyas secciones coinciden muestran el mapa desplegado sin apuntar a nada; con
  `#sección`, solo las secciones que encajan (como antes); con texto, todas, las coincidentes teñidas de
  su color y el resto atenuadas, con el término resaltado. Si la nota solo coincide por el título, se
  queda con su línea.
- Una nota **cifrada y bloqueada** no muestra secciones (no hay contenido en memoria).
- **Ajustes → Apariencia → "Sections in the sidebar":** *Folded map* (por defecto, lo de arriba) o
  *Scroll row*: las secciones de cada nota siempre visibles en una sola fila con scroll horizontal
  (bordes difuminados y flechas al desbordar), con las celdas del diseño nuevo a su ancho natural y la
  abierta en sólido; sin línea ni despliegue. Solo para este dispositivo (no se sincroniza). También desde el menú ⋯ del footer (*As map* / *As row*).
- El peek de un grupo colapsado sigue **el mismo ajuste** (línea plegada con su despliegue y mapa en la
  nota activa, o fila con scroll), en tamaño compacto. La **vista de contenido** enseña **siempre** todas
  las secciones de cada nota como celdas en varias líneas (sin scroll), sea cual sea el ajuste.

Iconos del TitleBar:
- **⬇ update**: aparece solo si hay una versión nueva; descarga e instala in-app (muestra el %
  de descarga y luego un spinner "Installing…").
- **☁ sync**: estado del backend de sync **activo** (NoteFlow Cloud o GitHub; oculto si no hay
  ninguno). Icono: nube verde = sincronizado · verde pulsante = subiendo cambios · ↻ girando =
  sincronizando · nube ámbar = error · nube tachada ámbar = bloqueado (claves de Cloud sin
  desbloquear o primer pull fallido). **Click** = sync manual. **Hover** (~450 ms) abre una
  mini-tarjeta flotante (`SyncStatusButton.tsx`, sin tooltip nativo; ~208 px) bajo el botón:
  cabecera de **una sola fila** con el nombre del repo (GitHub; `owner/repo` en el tooltip) o
  "NoteFlow Cloud" + píldora de estado (Synced / Uploading / Syncing / Error / Locked / Blocked /
  Pending); filas *Last sync* (relativo; hora exacta en el tooltip) y *Pending uploads*; una
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
  interfaz: System/English/Español; debajo, la sección **Activity**: **gráfico espejo** con
  **ventana adaptativa**: empieza el primer día con actividad (del log o de las notas), con un
  **mínimo de 4 semanas y un máximo de 16** (sin actividad → 4 semanas); si la ventana es de ≤56
  días, **un punto por día**, si no, **uno cada 2 días**; cada punto es la **suma móvil de los 7
  días** que acaban en él (con días previos completos para los primeros puntos; el último es hoy),
  para que la línea no caiga a cero con actividad escasa,
  con una baseline central fina y apagada sobre una cuadrícula muy tenue (una vertical por semana, contadas desde hoy) — **arriba, notas editadas** (verde
  fijo `#1D9E75`, el del mockup) y **abajo, secciones creadas** (violeta fijo `#7F77DD`);
  cada mitad es un área plana translúcida (~0.32) con contorno en zigzag de segmentos rectos
  (~1.25px), normalizada cada mitad con raíz cuadrada contra **su propio máximo** (las dos llenan su altura; no son comparables entre sí, los totales van en la leyenda). "Editadas" de un día
  = notas distintas del **log de actividad de este dispositivo** (`userData/activity-log.json`:
  ids de las notas que el usuario editó ese día en la app —editor, sticky, ventana de sección,
  menús/overviews y las ediciones del agente del chat—; nunca sync, imports, migración ni
  autoborrado) **∪** las notas cuyo `updated` cae ese día; en ambos casos no cuenta el día de
  creación de la nota (si sigue existiendo), y los ids de notas borradas sí cuentan. El log solo
  existe desde que el dispositivo empezó a registrar; antes solo se conoce la **última** edición
  de cada nota. "Sección creada" = día de `section.created` (o `note.created` en secciones
  antiguas; una nota sin secciones legibles, p. ej. cifrada bloqueada, cuenta una vez por su
  `created`) — sale de los datos de las notas, **no es por dispositivo**. Leyenda con los totales
  de la ventana real a la derecha del título ("↑ N notes edited · ↓ M sections created"; N = notas
  **distintas** editadas en la ventana), hint "Recent notes edited (tracked on this device) and
  sections created" y eje X dinámico "N weeks ago" (ventana múltiplo de 7) o "N days ago" /
  "Today", en HTML porque el SVG se estira; animación de entrada
  izquierda→derecha (respeta `prefers-reduced-motion`) y montículo semilla simétrico si no hay
  actividad; solo lee ids y timestamps, nunca contenido; `ActivityPulse.tsx` +
  `src/lib/activityPulse.ts`; bajo el gráfico, en filas título + descripción + control: **Local AI**
  (toggle de embeddings; activada, botón "Reindex all notes" con progreso), **Profile** (botón "Open
  profile setup" → abre el cerebro en la pestaña Profile y cierra Ajustes) y **Expose CLI skill to AI
  agents** (toggle: copia la skill del CLI a `~/.claude/skills` y `~/.agents/skills`, y a Windsurf si
  está instalado)), **Appearance** (tema/fuente/acento/colores del editor/escala/secciones del sidebar/vista cerebro),
  **Editor** (fuente/tamaño/ancho) — grupo **Preferences** —; **Sync** (NoteFlow Cloud + GitHub),
  **AI** (solo el proveedor del LLM), **Account** (cuenta NoteFlow) — grupo **Services** —; **Data** (export/import + carpeta
  de notas), **Startup** (autostart + stickies), **Templates** (plantillas de nota) — grupo **Your
  notes** —; y **Tutorial** (el tour "What's new", ver abajo), **Keyboard shortcuts** y **About**
  (versión + updates + **Send feedback** + repo) — grupo **Help**. **Send feedback** es un formulario
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
  el `+` → "Temporary note (24h)".
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
- Título editable (auto-save). Título por defecto: `DD/MM/YYYY`.
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
  new window" (actúa sobre la sección del panel activo). No está en el menú ⋯ del editor.
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
  la nota activa va resaltada. Se cierra al sacar el ratón de cabecera+ventanita (con margen para cruzar
  el hueco), salvo si ya se tecleó en el buscador: entonces solo con click fuera, Esc o al abrir algo.
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
- **Crear**: desde el submenú "Move to folder" → "+ New folder…", el menú contextual del grupo, o
  **"+ Folder"** bajo las carpetas del grupo en la vista de contenido.
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
- Al entrar se elige la **primera nota** de la lista (la última editada, o la primera del sidebar con
  "As in the sidebar") y su **primera sección**, con la vista previa abierta.

**Cómo salir:** `Esc` (cuando ya no queda nada que cerrar, ver Teclado), abrir una nota en el editor
(doble clic, `Intro` o "Open in the editor"), crear una nota, o seleccionar cualquier nota en el sidebar.

**Cabecera:** icono del lugar (pestaña grande del grupo con su esquina plegada de color; rejilla para
*All*; estrella para *Favorites*), la ruta si es carpeta ("Trabajo /"), el nombre y el resumen
`N notes · M folders · last edited X`. A la derecha: **buscador** local ("Search note or section", admite
`#sección`; no toca la búsqueda del sidebar; `Esc` lo vacía y `↓` baja a la lista), el **selector de
orden** de la lista (control segmentado pequeño **"By date"** / **"As in the sidebar"**, ver Columna 2; se
recuerda entre sesiones), **"+ Note"** (crea la
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
"+ Folder"), y al final *Ungrouped*. El lugar elegido lleva fondo neutro y una barra de 3 px de su
color a la izquierda.
- **"+ Folder"** al final de cada grupo (junto a la guía) y **"+ Group"** tras los grupos, ambos más
  apagados que los nombres de carpeta: se convierten en un campo; `Intro` (o salir con texto) crea y abre
  el lugar nuevo; `Esc` o salir vacío cancela.
- **Clic derecho** en un grupo o una carpeta → **el mismo menú que en el sidebar** (sin "View group",
  porque ya estás en la vista): new note / new folder, rename, color (8 del tema + color libre), archive y
  delete en grupos; new note, rename y delete en carpetas. **Rename** edita en la propia columna (`Intro`
  guarda, `Esc` cancela). Si borras el lugar en el que estás, la vista pasa a *All*.
- **Arrastrar** una nota (o la selección múltiple) desde la lista hasta un grupo, una carpeta o
  *Ungrouped* la mueve; el destino se resalta. También acepta notas arrastradas desde el sidebar.

**Columna 2 · Notas:** las del lugar, en uno de dos órdenes (selector de la cabecera):
- **By date** (por defecto): de la más reciente a la más antigua, en bloques con cabecera fija y
  contador: **Today**, **Yesterday**, **This week**, **Last 30 days**, **Earlier**.
- **As in the sidebar**: el mismo orden y agrupación que el sidebar (incluido el orden manual por
  arrastre). En un **grupo**: primero sus notas sueltas y luego cada carpeta con su cabecera fija (icono +
  nombre + contador). En una **carpeta**, *Favorites* o *Ungrouped*: sus notas en el orden del sidebar,
  sin cabeceras. En **All**: una cabecera por grupo (pestaña del color + nombre + contador), las carpetas
  como subcabeceras más pequeñas y sangradas que se quedan fijas bajo la del grupo, y al final
  **Ungrouped**; los grupos archivados solo con "Show archived". La hora muestra la fecha del item del
  sidebar (`14:32`, "Yesterday", `Oct 28`) y la ruta no repite lo que dicen las cabeceras. Las cabeceras
  que una búsqueda deja vacías desaparecen. Las flechas, `Mayús+clic` y la nota elegida al entrar siguen
  el orden que se ve.
- Cada fila: la hora a la izquierda (por fecha: `HH:mm` hoy y ayer, día de la semana esta semana, `d MMM` antes),
  el título (candado si está cifrada) y debajo la ruta, sin lo que ya dice el lugar (en *All* /
  *Favorites* / *Ungrouped*: pestaña + "Grupo / Carpeta"; en un grupo: la carpeta o "In the group"; en
  una carpeta: nada). A la derecha, la línea de colores de las secciones del sidebar, **solo
  decorativa** (no engorda ni despliega).
- **Debajo de cada nota, todas sus secciones** como celdas (las mismas del mapa del sidebar, en varias
  líneas). Clic en una celda → elige esa sección (se rellena de su color) y abre la vista previa; clic
  en la fila → la nota con su primera sección; **doble clic** o `Intro` → abre en el editor; clic derecho
  → menú de la nota o de la sección; hover en una celda → previsualización flotante. Con búsqueda, las
  celdas que coinciden se tiñen y el resto se atenúa.
- **Selección múltiple:** casilla en la columna de la hora al pasar el ratón (siempre visible mientras
  haya selección); `Ctrl/Cmd+clic` alterna, `Mayús+clic` marca el rango visible, `Ctrl/Cmd+A` marca
  todas las visibles, y con algo marcado basta un clic. Barra flotante al pie de la lista: contador,
  **Favorite/Unfavorite**, **Archive/Unarchive** (toggle), **Move to group** (o "No group"), **Move to
  folder** (solo con un grupo o carpeta como lugar), **Delete** (con confirmación) y ✕. Cambiar de lugar
  limpia la selección.
- Al cambiar de lugar, la nota elegida se mantiene si sigue en la lista; si no, pasa a la primera.

**Columna 3 · Vista previa** (se anima al abrir y cerrar): ruta (pestaña + Grupo / Carpeta / Nota),
nombre de la sección con su cuadradito de color, `Section n of m · X words · edited …` y el **contenido
real** de la sección en solo lectura (mismo render que el editor, con su fuente; en modo texto, tal
cual). Notas cifradas bloqueadas: aviso "This note is encrypted". Botón **"Open in the editor"**
(`Intro`). La **X** la cierra y la lista gana el ancho; no se reabre sola hasta que eliges otra sección
o nota.

**Teclado** (con el foco en la lista, que lo recibe al abrir): `↑ ↓` nota, `← →` sección, `Intro` abre
en el editor. `Esc`, por orden: cierra el menú ⋯, limpia la selección múltiple, cierra la vista previa
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
- **Click derecho** sobre un **tag de sección** (sidebar / vistas) o un **tab del editor** →
  **"Note overview"** (el menú de la nota en sí no lo ofrece).
- Pulsar la nota en el sidebar **no** la abre: va al editor, a la primera sección.

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
- Undo/Redo con `Ctrl+Z` / `Ctrl+Y`.

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
| Tabla | — | Toolbar (menú contextual para filas/columnas) |
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
- **Enter en una celda** crea otra línea en la celda; se guarda como salto de línea (`<br>`) y al
  reabrir es una línea más del mismo párrafo (antes las dos líneas se guardaban pegadas: `ab`).
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
  separadores) **y los bloques de código**; solo **tablas e imágenes rompen la columna** y siguen
  a ancho completo (los **tableros kanban** van más allá: ocupan el editor de borde a borde). El ancho de columna se deriva del tamaño de fuente base del cuerpo (no del de
  cada elemento), así los headings comparten la misma columna. Aplica a ambos modos (markdown y
  texto); no afecta a los stickies.
- En `Readable`, las acciones de cada tarea (importancia + deadline/badge) se sacan al margen
  derecho, fuera de la columna, cuando el editor mide ≥ 58em (container query en `src/index.css`).
  Si el bloque no cabe en el margen (badge con fecha + alarma), se desplaza hacia la izquierda
  solapando el final de la columna en vez de provocar scroll horizontal; el contenedor de scroll
  del editor es además `overflow-x: hidden` (tablas y código tienen su propio scroll interno).
  Con el índice visible, el borde derecho de esas acciones se acota además contra las rayitas del
  índice (se desplazan a la izquierda antes de llegar a ellas).
- Preferencia en `editorSettingsStore` junto a fuente/tamaño, **sincronizada** en `ui-settings.json`
  (`localStorage` `noteflow-readable-width` queda solo como dual-write legacy/seed).

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
  progreso. También hay un toggle **"Local AI"** en Settings → General.
- **Panel Related:** al cambiar de sección/nota, el panel actualiza las relacionadas; click en un
  resultado navega a esa sección. Las notas **cifradas se omiten** (no entran al índice).
- **Reindexar:** botón "Reindex all notes" en Settings → General (debajo del toggle "Local AI", muestra progreso); el índice también
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
- **Interacción:** navegación libre estilo Obsidian — arrastrar el lienzo (pan), **rueda para zoom**,
  arrastrar un nodo para recolocarlo. **Hover/seleccionar** una nota **resalta sus conexiones de
  contenido** y atenúa el resto. **Click en un nodo de nota/sección** ancla junto a él una
  **ventanita de previsualización clicable** (la misma tarjeta apaisada que la
  [previsualización al hover](#previsualización-de-sección-al-hover), del mismo tamaño; su borde se
  marca al pasar el ratón); al **pulsar dentro de la ventanita** se navega a esa sección en el editor. Se cierra con click fuera o `Esc`.
  Click en un grupo abre la vista de contenido en ese grupo. Los nombres de las notas aparecen al acercar el zoom.
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
  se abre cuando pulsas la pestaña **Profile** (o desde la paleta / Ajustes → General, botón "Open profile setup"). Pensado para
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
    modelos curados (el recomendado marcado "(Recommended)"; los que gastan la asignación al menos el
    doble de rápido, con sufijo "(≈N× quota)" — hoy ≈2× y ≈29×; el campo "Model" es de **solo
    lectura**, se elige haciendo clic en uno de los modelos) y **barra de consumo mensual** en
    porcentaje ("N% of this month’s AI allowance used": la asignación se mide por el coste real de
    cada petición, así que los modelos caros la gastan antes). La lista de
    modelos la sirve el servidor: los modelos nuevos **aparecen solos** (sin actualizar la app; "Load"
    fuerza el refresco), se recuerda entre arranques y offline, y tu modelo elegido no cambia. Botón "Use NoteFlow
    AI" para activarlo (o check "Active" si ya lo es). Sin sesión o sin suscripción, la card sigue
    visible pero en vez del botón muestra, sin sesión, "Already subscribed?" + botón **"Sign in"** (lleva a
    Ajustes → Suscripción) y, con sesión sin suscripción, el aviso "requires subscription" (badge "Paid")
    **+ el bloque de planes con precios**: NoteFlow AI y, si tampoco tienes Cloud, el Bundle (con
    badge "Best value"). **La card entera es clickable**: con sesión y checkout configurado abre la
    pasarela de pago de ESE plan (antes había un botón "Subscribe" dentro; ahora la card muestra un CTA
    "Subscribe"); sin sesión, clicar la card lleva a Ajustes → Suscripción (CTA "Go to Subscription" con flecha);
    con sesión pero sin checkout en el build muestra "coming soon" y queda inerte. Bajo los planes,
    una lista **"What you get"** con las ventajas de NoteFlow AI frente a la vía gratis (sin Ollama ni
    API keys, más barato con los modelos más eficientes, con tools e imágenes, asignación mensual con consumo visible, catálogo
    siempre al día). Esto vale tanto en
    Ajustes → IA (que ya no lleva título "Assistant (LLM)": empieza directamente con la línea "Pick one
    source…" y las dos cards) como en el **panel de IA del Cerebro** (antes solo en Ajustes). Lo mismo si la
    suscripción caduca teniéndolo activo, para que entiendas el fallo y puedas cambiar de fuente.
    **Se activa solo lo que tienes pagado** (NoteFlow AI con el plan AI, NoteFlow Cloud con el plan
    Cloud, ambos con el Bundle) en dos momentos: **al iniciar sesión** (primer login, dispositivo nuevo
    o vuelta a tu cuenta) y **al suscribirte con la sesión ya abierta** (Subscribe → pagar → Refresh en
    Settings → Subscription). Una sesión que se **restaura al arrancar la app no cuenta como login**: si
    apagaste Cloud o elegiste tu propio proveedor, no se te vuelve a cambiar en cada arranque. Y perder
    una suscripción **nunca apaga nada** por sí sola: la feature se te vuelve a ofrecer y decides tú.
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
cerebro y de la ventana aparte, este panel **no muestra preguntas sugeridas** (ni al empezar ni tras
cada respuesta). Sin IA configurada, ofrece ir a **Ajustes → IA**.

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
  de la cabecera permite verlas «As in the sidebar», por grupos y carpetas. El sidebar tampoco tiene filtro de fecha (solo
  búsqueda, tags y archived).

### Filtros por tags
- Click en un tag del sidebar → filtra notas con ese tag. Click de nuevo → limpia.

### Notas archivadas
- Ocultas por defecto. Toggle `Show archived` / `Hide archived` en el menú ⋯ del footer. El mismo
  toggle revela también los **grupos archivados** (atenuados, al final de la lista).

### Footer del sidebar
- Franja fija bajo la lista (divisor de borde a borde). A la izquierda, **"N notes · M sections"**:
  cuenta lo que lista el sidebar en ese momento (sin archivadas salvo con "Show archived", y con el
  filtro de tag o la búsqueda aplicados; una nota cifrada bloqueada no suma secciones).
- A la derecha, **⋯** ("More options") abre un menú hacia arriba con tres bloques:
  **Theme** — *Light* / *Dark* (los temas NoteFlow Light y NoteFlow Dark, con check en el activo; con
  otro tema activo ninguno lleva check y elegir uno cambia a él; igual que elegirlo en Ajustes →
  Apariencia) · **Sections** — *As map* / *As row* (el ajuste "Sections in the sidebar", solo en este
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
  en pestañas, el Cerebro, enlazar secciones + paleta, captura rápida (`Ctrl+Shift+Space`, nota
  temporal), sticky / ventanas separadas, kanban, la IA, tus agentes de IA con el CLI (el clip
  abre en un terminal: el agente ejecuta `noteflow add` y la tarea aparece en vivo en la app), sync
  (GitHub / NoteFlow Cloud), el mapa de
  secciones plegado del sidebar, el sidebar flotante (`Ctrl+'`, minimapa + peek de grupo colapsado),
  los fragmentos del botón del sello y "And much more"
  (rejilla: notas cifradas, plantillas, temas y acentos, tareas con alarma, vista dividida
  `Ctrl+Click`, CLI, importar de Notion y Keep). Los clips pueden estar grabados por idioma de la UI.
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
- Detalle técnico (elección del asset, allowlist, instalación por plataforma): `.agents/context/patterns.md`
  § "Auto-update in-app".

---

## Settings → Sync: elegir backend

La página **Sync** empieza con un **selector de dos tarjetas** — **NoteFlow Cloud** y **GitHub
Sync** — porque son **mutuamente excluyentes**: solo un backend puede estar activo a la vez. Cada
tarjeta lleva un **badge de estado** (Active / Paused / Inactive / Not connected) y, al pulsarla,
debajo se muestra **solo el panel de ese backend**. Al abrir la página viene preseleccionado el
backend que esté realmente en uso (Cloud activado → Cloud; si no, GitHub conectado → GitHub; si
ninguno → Cloud); a partir de ahí manda la elección del usuario. Con Cloud activado, GitHub queda
**en pausa** (badge amarillo + aviso ámbar en su panel; la config de GitHub se conserva).

**Command line (CLI) — "Connect the CLI too".** Debajo de todo, si el backend seleccionado está
conectado en la app (Cloud activo con sesión, o GitHub conectado), una sección da al CLI `noteflow` su
propio acceso a ese backend, para que lo que se escribe desde la terminal o por agentes de IA también
se sincronice:
- **Cloud:** el botón envía un código al email de la cuenta de la app; aparece un campo inline para
  el código ("Connect CLI", "Send a new code", Cancel; código inválido/caducado se muestra inline). El
  CLI inicia **su propia** sesión (la app sigue con la suya) y no hace pull. Si la cuenta usa cifrado
  privado (E2EE), un aviso ámbar explica que el CLI solo sincroniza con la passphrase (prompt en cada
  ejecución o `NOTEFLOW_CLOUD_PASSPHRASE`).
- **GitHub:** sin código; antes de copiar el token, un diálogo avisa de que el CLI lo guarda en
  base64, sin el cifrado del llavero del sistema ("Copy token").
- **Conectado:** "CLI connected (email)" / "CLI connected (owner/repo)" + **Disconnect CLI**, que solo
  quita lo del CLI (nunca la conexión de la app). Si el CLI ya estaba conectado desde la terminal,
  sale igual como conectado. Detalle técnico en `.agents/context/patterns.md` § CLI.

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
- **Sin sesión:** "Already subscribed?" + botón **"Sign in"** (lleva a Ajustes → Suscripción) — la cuenta
  es solo para usuarios de pago, así que no se presenta como "inicia sesión para sincronizar".
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
  **mismo bloque de planes** que Ajustes → Suscripción — NoteFlow Cloud y, si tampoco tienes AI, el
  Bundle con badge "Best value" —, cada card clickable para abrir su checkout, y debajo la lista
  **"What you get"** de Cloud (cifrado en tránsito y en reposo, sync automático, elegir Estándar o
  Privado E2EE, sin repo de GitHub). El panel Cloud ya no tiene párrafo de introducción propio (lo
  describe la card del selector). **Unlock, Sync now,
  Disable y Lock funcionan sin suscripción**: quien ya tiene claves y datos subidos puede seguir
  desbloqueando y bajándose sus notas aunque caduque.
- **Sin sesión**, el panel ya no se limita a pedirte que inicies sesión: muestra también esos
  precios, y clicar cualquier card lleva a Ajustes → Suscripción para crear la cuenta sin salir de Ajustes.
- Antes de activar con GitHub Sync conectado, aviso ámbar: "GitHub Sync quedará en pausa" (solo
  cuando activar Cloud está realmente al alcance, es decir con la entitlement `cloud`). Este aviso es
  del **Enable manual**: la **auto-activación** (al iniciar sesión o al suscribirte con el plan Cloud)
  pausa GitHub Sync **sin aviso previo**.

Detalle técnico (jerarquía de claves, modos managed/e2ee, motor de sync):
`.agents/context/monetization.md` § 4.

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
  (`noteflow push` y el push de cada comando) tampoco pisa, pero aún **no fusiona**: guarda tu versión
  como copia de conflicto e imprime `Conflict: local changes kept as "…"`.
- Se sincronizan notas + `groups.json`, `folders.json`, `section-colors.json`, `note-order.json`,
  `templates.json`, `snippets.json` (fragmentos del toolbar), `ui-settings.json` (apariencia y ajustes
  del editor).
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

## Cuenta NoteFlow (Settings → Subscription)

El apartado de Ajustes se llama **"Subscription"/"Suscripción"** (id interno `'account'`) para que
nadie confunda iniciar sesión con activar la sincronización: el texto sin sesión empieza por "For paid
users:". Cuenta opcional para las suscripciones (**NoteFlow AI** — €5.99/mes · €49.99/año; **NoteFlow
Cloud**, con panel en Settings → Sync — €3.99/mes · €39.99/año; **NoteFlow Bundle**, AI + Cloud
juntos — €7.99/mes · €79.99/año). Los tres son comprables: las tres URLs de checkout están
pobladas en la build (precios en `.agents/context/monetization.md` § visión, cifras de display en
`src/lib/subscriptionPlans.ts`). Todo lo gratuito sigue funcionando sin cuenta.

- **Sign-in sin contraseña:** email → "Send code" → código de acceso por email (8 dígitos) → "Verify &
  sign in" (misma UX de código que el Device Flow de GitHub). "Use a different email" vuelve atrás.
- **Código incorrecto:** el error NO sale en la caja roja de arriba, sale **pegado al input**
  (icono ⚠ + "That code doesn't match, or it has expired…"), el input se pone con borde rojo y da
  un **shake** corto, y su contenido queda **seleccionado** para reteclear directo; el error se
  borra en cuanto escribes. Junto a "Verify & sign in" hay **"Resend code"** (con cuenta atrás de
  60 s tras cada envío) para pedir otro código sin volver al paso del email — al llegar el nuevo,
  línea "New code sent — check your inbox.". Los mensajes de error vienen **traducidos** (el
  proceso main manda un código de error, no texto en inglés).
- **Con sesión:** muestra el email, badges de plan ("NoteFlow AI" / "NoteFlow Cloud" con estado
  Active/—), la sección de **planes**, botón "Refresh" (relee las suscripciones) y "Sign out".
- **Plan aún sin comprobar:** si la app no ha podido consultar tu plan todavía (arranque sin red,
  servidor caído) y no tiene uno guardado de la última vez, los badges dicen **"Couldn't check"** y
  en los gates de IA y Cloud, en vez de las cards de Subscribe o del "requiere suscripción", aparece
  **"Couldn't verify your plan yet — Retry"** (nunca te ofrece pagar algo que quizá ya pagas). La
  app reintenta sola (cada vez más espaciado, al volver de suspensión y al recuperar la red);
  mientras, NoteFlow AI se deja usar (el servidor decide). La última respuesta buena se recuerda,
  así que tras reiniciar el plan se ve al momento.
- **Llavero bloqueado:** si el sistema no deja descifrar la sesión guardada (Linux antes de
  desbloquear el llavero, Keychain denegado en macOS), **no** se cierra sesión: aviso ámbar
  "Couldn't unlock your saved session — your system keychain may be locked…" con Refresh para
  reintentar o Sign out. Se recupera sola en cuanto el llavero se desbloquea.
- **Sign out** cierra solo la sesión de este equipo (otros dispositivos y el CLI siguen dentro).
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
| `Ctrl++` / `Ctrl+-` / `Ctrl+0` | Fuente: aumentar / disminuir / reset |

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
