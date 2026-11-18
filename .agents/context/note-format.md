# NoteFlow — Formato de nota y cifrado

## Formato de archivos de nota (v2 — carpeta por nota)

Cada nota es un **directorio** `<slug>-<id>/` (nombre congelado al crear; cambiar el título NO
renombra la carpeta). Dentro: `note.md` (**solo frontmatter**: metadatos + índice de secciones)
y **un `.md` por sección** (`<sectionId>.md`, markdown puro sin frontmatter — editable con
cualquier editor externo, diffs de git limpios). Fuente de verdad: `src/lib/noteUtils.ts`
(`parseNoteFolder` / `serializeNoteFolder` / `buildNoteWritePayload`), **espejado** en
`electron/noteFormat.ts` para main/worker y en `cli/noteflow.js` — mantener los tres en sync.

```
mi-nota-abc12345/
  note.md       ← ancla de metadatos (frontmatter only)
  sec001.md     ← cuerpo de la sección "Note"
  sec002.md     ← cuerpo de la sección "Tasks"
```

`note.md`:
```markdown
---
id: abc12345
title: "Mi nota"
tags: [javascript, react]
created: 2026-01-01T00:00:00.000Z
updated: 2026-01-02T00:00:00.000Z   # timestamp CANÓNICO de conflicto para TODA la nota
formatVersion: 2
group: grp001        # opcional — id de NoteGroup
folder: fld001       # opcional — id de NoteFolder (requiere group)
expiresAt: 2026-01-03T00:00:00.000Z   # opcional — nota temporal (autoborrado)
sections:
  - id: sec001
    name: Note
    file: sec001.md
    isRawMode: true   # true = modo texto (la app lo muestra tal cual, sin renderizar); false/ausente = modo markdown (renderizado). El .md guarda markdown en ambos
    aiHidden: true    # opcional — la IA NUNCA ve esta sección (índice, chat RAG, tools)
  - id: sec002
    name: Tasks
    file: sec002.md
    created: "2026-01-05T10:00:00.000Z"   # opcional — creación de ESTA sección (ver abajo)
archived: true    # solo presente si true
favorited: true   # solo presente si true
localOnly: true   # solo presente si true — la nota NUNCA se sincroniza (hoy solo la de bienvenida)
---
```

Notas **cifradas**: la carpeta contiene **solo `note.md`** (sin secciones en claro); el
frontmatter lleva el bloque `encryption` de siempre:
```yaml
encryption:
  alg: aes-256-gcm+pbkdf2
  salt: <base64url>
  iv: <base64url>
  ciphertext: <base64url>
  iterations: 310000   # omitido si es el default
  hashAlg: SHA-256     # omitido si es el default
```

- Marcador de versión: `<notesDir>/.noteflow-format` (contenido `2`).
- En memoria el `Note` sigue hidratado (`sections[].content`); `Note.filePath` = **directorio**;
  `Note.raw` = contenido de `note.md`. La UI (editor, sidebar, stickies) no cambió.
- Título por defecto: `DD/MM/YYYY`. Sección por defecto: `Note` en modo markdown (`defaultSections()`, sin `isRawMode`); el CLI también crea las suyas en modo markdown desde v2.5.0 (antes, modo texto) y `--raw` las pone en modo texto (`isRawMode: true`); la `Note` de una nota v1 solo-cuerpo sale en modo markdown tanto en el migrador del escritorio (`parseLegacyNoteRaw`) como en `noteflow migrate`.
- **`created` por sección** (opcional, ISO 8601, misma clave en desktop, CLI y móvil): se escribe
  solo si existe y se conserva en el round-trip (también dentro del payload cifrado, que es el JSON
  del array `sections`). Se asigna `now` al **crear** una sección (nueva pestaña, duplicar — la
  copia es nueva —, `section add`/`set`/`add` del CLI, tools `create_note`/`add_section` del
  agente); las secciones iniciales de una nota nueva (nota vacía, plantilla, duplicar nota, perfil
  IA, import) llevan el mismo timestamp que `note.created`. Excepción: al **regenerar** el perfil
  de IA sobre una nota ya existente (`ProfileFlow.tsx`, "Start over" → `updateNote` in situ), las
  secciones nuevas llevan la hora de la regeneración, no `note.created` de la nota reutilizada.
  Las **plantillas** (`templates.json`) no guardan el `created` de las secciones
  (`templatesStore.createTemplate` lo descarta). **Nunca se rellena** al parsear notas
  antiguas ni en la migración v1→v2, y no se reescriben ficheros para backfill: la UI hace el
  fallback al mostrar con `firstValidDate(section.created, note.created)` (`src/lib/dateUtils.ts`;
  un valor no parseable —p. ej. editado a mano— también cae a `note.created`, y si ninguno es
  válido no se muestra la fecha) — solo en la línea `Created …` bajo el título del editor (ninguna
  tarjeta de preview —vista de nota, hover, cerebro— muestra la fecha de la sección).
- **`localOnly: true`** (clave de primer nivel de `note.md`, también en notas cifradas: va fuera del
  bloque `encryption`): la nota no sale nunca de este dispositivo — ningún camino de sync de GitHub, Cloud
  ni el CLI la sube, la journala ni la borra en remoto (detalle en `sync.md` "Notas solo-locales"). Hoy
  solo la lleva la **nota de bienvenida** de la primera ejecución (`electron/welcomeNote.ts`); no hay UI
  para ponerla ni quitarla. Los **tres espejos** la conservan en el round-trip (`parseMetaFields`/
  `serializeNoteFolder` de `noteUtils.ts`, `parseDiskMeta`/`serializeNoteFolder` de `noteFormat.ts`,
  `parseNoteYaml`/`serializeNoteMd` del CLI): si uno la perdiera al guardar, la nota empezaría a
  sincronizarse. *Duplicate* crea una nota normal (construye el borrador campo a campo); exportar la
  conserva (bundle tal cual), así que una nota solo-local importada en otro equipo sigue siendo solo-local.
- **Notas vinculadas** (un archivo de texto externo —Markdown o texto plano— editado en su sitio): **no usan
  este formato** ni viven en el dir de notas. El archivo es del usuario tal cual (el frontmatter de un `.md`,
  si lo tiene, se preserva y no es de NoteFlow); los metadatos de la nota van en `userData/linked-notes.json`. Ver `patterns.md` § "Notas
  vinculadas".
- Tags se extraen del contenido con `#nombre` (`extractTags`).
- `NOTEFLOW_NOTES_DIR` (env) redirige el dir de notas en app y CLI (testing/scripting).
- Los parsers toleran BOM UTF-8 (editores externos como Notepad lo añaden).

### Tablas: ancho de columna (cuerpo de sección)
El cuerpo de una sección es Markdown (`lib/markdownHtml.ts`, ver `patterns.md` "Editor: tablas"); no
toca el frontmatter ni los tres espejos (`noteUtils`/`noteFormat`/CLI no leen tablas). Las tablas son
pipe-tables GFM y el **ancho de una columna va en su celda de la fila separadora**:
- **Codificación:** nº de **guiones** de la celda (los `:` son la alineación y no cuentan:
  `:------------:` = centrada, 12 guiones). **1 guion = 0,5em** del tamaño de letra de la tabla (≈ un
  carácter medio: "N guiones ≈ N caracteres"; escala igual en editor, sticky, vista previa y tarjeta del
  resumen). `---` = **automático** (se ajusta al contenido, lo de siempre). Con ancho: **10…80 guiones**
  (5em…40em): el mínimo es justo el de una columna automática (`min-width: 5em`), así ninguna columna puesta
  a mano es más estrecha que una automática; 4-9 se leen como automático (y se reescriben `---`), más de 80
  como 80. El ancho es el de la caja de la celda (border-box, de rejilla a rejilla). Ej.:
  `| Producto | Precio | Notas |` + `| ------------------------ | ----------: | --- |` = 12em, 5em a la
  derecha, automática.
- **Lo que se ve:** la columna mide máx(n guiones, palabra más larga de la cabecera): la cabecera nunca
  se parte dentro de una palabra (las celdas del cuerpo sí, para no ensanchar la columna). El arrastre no
  baja de esa palabra, así que lo guardado es lo que se ve; si luego se renombra la cabecera con una palabra
  más larga, o el ancho se escribió a mano, la columna se ve más ancha que lo guardado (sin cortes) y el
  markdown no cambia hasta que se vuelva a redimensionar.
- **Puertas al leer** (por tabla; si falla una, **toda** la tabla es automática): (1) separador con el
  **espaciado canónico** de NoteFlow `| c1 | c2 | … |` (barras exteriores, un espacio a cada lado de cada
  celda; se toleran espacios finales; vale para una columna) — lo compacto de una IA (`|------|`), lo
  indentado o sin barras exteriores no pasa; (2) separador **no alineado con la cabecera**: si sus barras
  sin escapar (`\|` es texto) caen en las mismas posiciones que las de la cabecera, es una tabla de un
  formateador (Prettier, VS Code) o de una IA que alinea → automática.
- **Al escribir** (`tableElToMd`, ancho leído de la celda de cabecera): sin ancho → `---` exactamente como
  antes (`:---:`, `---:`, `:---`); con ancho n → n guiones con sus `:`. Si con anchos el separador quedara
  alineado con la cabecera (puerta 2), se **suma 1 guion a la última columna con ancho** (se resta si está
  en 80): cambio de 0,5em, solo en ese caso, estable desde el primer guardado. Una nota sin anchos se
  guarda byte a byte como antes.
- **Contextos que ignoran siempre los anchos:** markdown pegado como texto (`tableClipboard.ts`,
  `htmlFromMarkdown(…, { columnWidths: false })`), el chat de IA (`ChatView.tsx`, salida de un LLM) y el
  modo `plain` (notas vinculadas y sus vistas previas: ni se leen ni se escriben, el separador sale `---`).
  Una IA que escribe en una nota (tools del agente) o el CLI pasan por las mismas puertas: lo típico
  (alineado o compacto) queda automático. Los **snippets** sí leen anchos (los escribe el usuario: se leen
  como una nota, salvo en una nota vinculada).
- **Consecuencia aceptada:** una tabla escrita a mano con separador espaciado, no alineada y con ≥ 10
  guiones en alguna columna sí toma anchos (es la forma de ponerlos a mano).
- **Móvil:** aún no lo lee ni lo conserva (ver "⚠ Pendiente portar a móvil" en `patterns.md`).

### Bloque de dibujo (cuerpo de sección)
Como el kanban, vive en el Markdown de la sección (`src/lib/drawing/drawingBlock.ts`, integrado en
`lib/markdownHtml.ts`); **no** toca el frontmatter ni los tres espejos. Son dos marcadores de comentario
HTML en columna 0 alrededor de **un único code fence**, cuyo lenguaje dice la variante:

````
<!-- drawing -->
```mermaid
flowchart TD
  A[Idea] --> B{Worth it?}
```
<!-- /drawing -->
````

````
<!-- drawing height="320" -->
```excalidraw
{"type":"excalidraw","version":2,"appState":{"viewBackgroundColor":"transparent"}}
{"id":"a1","type":"rectangle","x":10,"y":20,"width":120,"height":60,"angle":0,"seed":1}
{"id":"a2","type":"text","x":20,"y":30,"width":40,"height":20,"containerId":"a1","text":"Idea"}
{"file":{"id":"f1","mimeType":"image/png","created":1,"dataURL":"data:image/png;base64,…"}}
```
<!-- /drawing -->
````

- **Fuente (`mermaid`):** el texto Mermaid tal cual (lo que escriben la IA y el CLI). Se conserva byte a
  byte, líneas en blanco incluidas — con una salvedad: un fuente que sea **una única línea en blanco** se
  guarda vacío (fence sin contenido).
- **Escena (`excalidraw`):** un objeto JSON **por línea**, para que el diff de git y la fusión por líneas
  del sync (`mergeSectionText`) trabajen por elemento. Serialización **canónica** (`serializeSceneBody`:
  la misma escena da siempre los mismos bytes):
  1. **Cabecera** `{"type":"excalidraw","version":2,"appState":{…}}`. `version` es la del formato: una
     cabecera con `version` **mayor que 2** NO es un dibujo para este build (el bloque se queda como texto,
     intacto) — así un cliente antiguo nunca reescribe un formato futuro. Sin `version` o con una menor,
     se lee. Del `appState` solo se guardan
     `gridModeEnabled`, `gridSize`, `gridStep` y `viewBackgroundColor` (los no nulos; sin ninguno se omite
     `appState`). Nada del estado de sesión (zoom, selección, herramienta…).
  2. **Una línea por elemento** no borrado, en el orden de la escena (orden Z). Claves: `id`, `type`, `x`,
     `y`, `width`, `height` y luego el resto en orden alfabético; objetos anidados con claves ordenadas.
     **Se omiten** `isDeleted`, `version`, `versionNonce` y `updated` (contabilidad de colaboración que
     Excalidraw regenera al cargar con `restoreElements`; así un elemento que vuelve a su sitio da la misma
     línea). `seed` e `index` sí se guardan. `boundElements: null` se escribe `[]` (es lo que Excalidraw
     deja al cargar; si no, la línea cambiaría solo por reabrir).
  3. **Una línea `{"file":{…}}` por imagen** que use algún elemento (`fileId`), ordenadas por id (su
     `dataURL` debe ser una URL `data:`; si no, el bloque es inválido), sin
     `lastRetrieved`. Las imágenes sin usar se descartan.
  - **Redondeo:** los enteros no se tocan; `x`, `y`, `width`, `height`, `points`, `gap` y `fontSize` a
    **2 decimales**; cualquier otro número fraccionario (ángulo en radianes, `focus`/`fixedPoint` de los
    enlaces, `pressures`, `lineHeight`…) a **4**.
- **Atributos del marcador de apertura:** cadena opaca `clave="valor"` conservada en el round-trip (misma
  sintaxis que el kanban: `getKanbanAttr`/`setKanbanAttr`). `height` = alto en px de la vista previa (80…1600;
  sin él, el alto propio del dibujo hasta 360 px, o el que dé su proporción si hay `width`). `width` = ancho
  en px de la tarjeta (160…4000; sin él, el de la columna de lectura; más ancho que la columna, sobresale
  centrada como las imágenes; en pantalla nunca pasa del ancho del editor, sin reescribir el atributo).
  Valores no numéricos o fuera de mínimo se ignoran. Ej.: `<!-- drawing width="900" height="320" -->`. Un marcador cuyos atributos contengan `-->` **no** es un
  marcador de apertura (el comentario HTML acabaría ahí): la región se queda como texto.
- **Longitud del fence:** tres backticks, o uno más que la línea de solo-backticks más larga del contenido
  (un Mermaid con una línea ` ``` ` no rompe el bloque). El fence se cierra en la primera línea formada solo
  por al menos tantos backticks como la de apertura.
- **Tolerado al leer** (y normalizado al guardar): líneas en blanco entre marcador y fence y entre líneas de
  la escena, CRLF, claves en cualquier orden, decimales de más, y un **documento Excalidraw entero** pegado
  en el fence (`{"type":"excalidraw","elements":[…],"files":{…}}`, en una o varias líneas).
- **Validez — si falla algo, NO es un dibujo** (`parseDrawingMarkdown` → `null`) y la región se pinta y se
  guarda exactamente como antes de existir el bloque (dos comentarios como texto y un bloque de código
  normal), sin reescribir nada: falta un marcador o el fence, hay texto entre marcador y fence, el lenguaje
  no es `mermaid`/`excalidraw`, marcador o fence indentados, atributos con `-->`; en una escena, cualquier
  línea que no sea un objeto JSON, sin cabecera, con otro `type` o con `version` > 2, elemento sin
  `id`/`type`, `id` repetido, línea desconocida;
  en una fuente, una línea de marca de conflicto de sync (`> ⚠…`). **Es la red de seguridad ante conflictos
  de sync:** el bloque de conflicto cae dentro del fence, el dibujo pasa a ser texto con las dos versiones
  visibles, y al resolverlo a mano (también en modo texto) vuelve a ser un dibujo.
- **Dónde se lee:** solo en el nivel superior de la sección. No dentro de una cita ni de un bloque de
  código — incluido el bloque de un fence **sin cerrar**, que se pinta como código hasta su final: un dibujo
  pegado debajo (sin línea en blanco) sigue siendo código, como siempre —, ni en modo `plain` (notas vinculadas: se queda como texto y código). Sí en markdown pegado y en
  el chat de IA (`columnWidths: false`), igual que el kanban.
- **Fusión por líneas (límites conocidos, cubiertos por tests):** ediciones de elementos distintos y no
  contiguos fusionan limpio; elementos añadidos al final en los dos lados se conservan (los del remoto
  primero); el mismo elemento editado en los dos lados, o **dos elementos contiguos** editados cada uno en
  un lado, dan conflicto → texto. ⚠️ **Dos dispositivos que crean un dibujo en el mismo punto** de la
  sección (donde la base no tenía nada) se fusionan en **un solo bloque** con los elementos de ambos, sin
  aviso: marcadores, fence y cabecera son líneas idénticas en los dos lados y la fusión las toma una vez.
  No se pierde ningún elemento, pero los dos dibujos quedan superpuestos en el mismo lienzo.
- **Cargar y guardar (editor):** una escena se carga SIEMPRE por el `restore` de Excalidraw
  (`lib/drawing/drawingScene.ts` → `restoreScene`), nunca con los elementos crudos; `refreshDimensions` solo
  si algún texto viene sin tamaño (escrito a mano: Excalidraw lo descartaría por invisible) — nunca para una
  escena que escribió Excalidraw, porque re-mediría el texto con las métricas de cada plataforma. El editor
  solo reescribe el bloque si el usuario cambió la escena (ver `patterns.md` § «Bloque de dibujo»): abrir y
  cerrar no canoniza un bloque escrito a mano.
- **Texto legible:** `drawingText(block)` (fuente → el Mermaid; escena → etiquetas y conexiones «A → B»).
  De él salen el texto de respaldo del bloque, la búsqueda (en nota y global), el recuento de palabras y
  lo que ve la IA (`[drawing #n: …]`); los tags ignoran los dibujos enteros. Ver `patterns.md` § «Bloque
  de dibujo» → «El dibujo como texto» y `ai.md` § «Dibujos y la IA».
- **CLI:** no conoce el formato (lee y escribe el markdown tal cual); su skill explica cómo añadir un
  diagrama Mermaid y que un bloque `excalidraw` no se edita a mano.
- **Móvil:** aún no lo conoce. Su conversor (espejo antiguo de `markdownHtml.ts`) lo lee como párrafo +
  bloque de código + párrafo y, al guardar la sección, lo reescribe con una línea en blanco entre
  marcador y fence (el escritorio lo tolera y lo normaliza); un fence de 4+ backticks no lo conserva.

### Migración v1 → v2
- **Local** (`electron/migration.ts` → `migrateNotesDirToV2`): corre al arrancar, ANTES del pull
  inicial y del watcher. Convierte cada `<slug>-<id>.md` plano de la raíz en carpeta (parser
  legacy v1: sections inline / claves `section_*` / cuerpo plano), **preservando `updated`**,
  con write→verify→unlink. Idempotente (re-absorbe planos sueltos aunque exista el marcador).
  El CLI tiene `noteflow migrate` (local + remoto). Tras migrar, si la IA está activa se
  programa un `reindexAll` (los `file_path` del índice quedaron obsoletos).
- **Remota** (`githubSync.migrateRemoteToV2IfNeeded`): guardada por
  `settings.githubSync.remoteFormatMigratedAt` + pull inicial OK; disparada desde el arranque,
  `sync:pull` manual y al conectar. Importa los planos remotos que falten o sean más nuevos que
  la carpeta local, hace `pushAllNotes`, borra los planos del remoto y sube el marcador
  `.noteflow-format` AL FINAL. Mientras el remoto siga en v1 (planos y sin marcador), el pull es
  **solo aditivo** (borrados deshabilitados) para no perder carpetas recién migradas. Un plano que
  **no se pudo leer o convertir** (GET fallido, >1 MB sin poder bajar sus bytes, parse que lanza)
  **no se borra** del remoto, y entonces no se sube el marcador ni se guarda
  `remoteFormatMigratedAt`: la migración se reintenta en el siguiente disparo (arranque, pull manual,
  conectar — ninguno periódico, sin bucle) y solo relee los planos que quedan.
- **Orden de despliegue:** actualizar TODOS los clientes (desktop, CLI, móvil) antes de migrar;
  un cliente v1 que escriba después re-crearía archivos planos (la migración los re-absorbe en
  el siguiente arranque, pero mejor evitarlo).
- Smoke test: `node scripts/format-migration-smoke.cjs` (migración + round-trip, sin Electron).

### Cifrado de notas (`src/lib/cryptoUtils.ts`)
AES-256-GCM + PBKDF2 (310.000 iteraciones por defecto, SHA-256) vía WebCrypto. La nota cifrada
guarda solo el bloque `encryption`; sin contraseña no hay secciones legibles. Sin master key ni
backdoor.
