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
    updated: "2026-01-06T09:30:00.000Z"   # opcional — última edición (contenido/nombre) de ESTA sección (ver abajo)
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

- **Nombre de carpeta** (`noteDirname(id, title)` → `<slug>-<id>`, o solo `<id>` si el slug queda
  vacío). Slug: título en minúsculas → **transliteración de acentos** (`normalize('NFD')` y fuera las
  marcas diacríticas U+0300–U+036F: `Reunión 12 nov` → `reunion-12-nov`, `Cumpleaños` → `cumpleanos`)
  → fuera todo lo que no sea `[a-z0-9\s-]` → trim → espacios a `-` → primeros 40 caracteres. Las letras
  sin descomposición (`ß`, `ø`…) se siguen descartando. **Tres espejos con la misma regla**
  (`src/lib/noteUtils.ts`, `electron/noteFormat.ts`, `cli/noteflow.js`; paridad en
  `tests/cli/commandSurface.test.ts`); la tool `create_note` del agente llama a
  `noteFormat.noteDirname` (antes tenía una copia). Hasta 2026-11-17 (CLI < 2.15.0) las letras
  acentuadas se **descartaban** (`reunin-12-nov`, `cumpleaos`): esas carpetas se quedan como están —
  el slug se congela al crear, no hay renombrado ni migración, y nada depende de que el slug coincida
  con el título (la identidad es el `id`).
- **Escalares YAML en el CLI:** el CLI no usa js-yaml; escribe título, nombres de sección y tags
  entre comillas dobles (`q()`) y los lee con `unquote()`, inversos exactos entre sí y compatibles con
  js-yaml en ambos sentidos para escalares de una línea (un título con salto de línea, que la app
  escribe como bloque `|-`, el CLI sigue sin leerlo bien: limitación anterior) (detalle y escapes soportados en `patterns.md` § CLI "Lector/escritor de
  escalares YAML"). Un título con `"` o `\` es válido en los tres clientes.
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
- **`updated` por sección** (opcional, ISO 8601, misma clave en desktop, CLI y móvil; va en la
  entrada del índice junto a `created`): hora del **último cambio de contenido o nombre de ESA
  sección**. Se escribe solo si existe y se conserva en el round-trip de los tres espejos (también
  dentro del payload cifrado, que es el JSON del array `sections`). **`note.updated` sigue siendo el
  timestamp canónico** de conflictos/sync; el de sección es solo informativo. Reglas:
  - **Se estampa (`now`)** cuando cambia `content` o `name` de esa sección y solo de esa; las demás
    conservan el suyo. **No** lo mueven `isRawMode` (decidido: cambiar el modo de vista no es editar;
    si al volver al editor éste reescribe un markdown distinto, eso sí es un cambio de contenido y lo
    estampa), `aiHidden`, el orden ni un re-guardado idéntico (el editor puede emitir el mismo
    markdown al montar).
  - **Al nacer**, `updated` = su `created` (mismo valor): nueva pestaña/sección, duplicar sección o
    nota (la copia es nueva: **no hereda** el `updated` del original), secciones iniciales de una nota
    nueva (= `note.created`), perfil IA, tools `create_note`/`add_section`, `section add`/`add`/`set
    --create`/`new` del CLI, nota de bienvenida, import de un `.txt`/`.md`. En el import de otras apps
    (Notion/Keep/carpeta md) la sección lleva `created` = el de la nota externa y `updated` = la hora
    del import (= `note.updated`).
  - **Escritores:** renderer — un único embudo, `applyNoteUpdate` de `notesStore` (por ahí pasan
    `updateNote({sections})`, `mutateSections`, `updateSection`, `duplicateSection`), que llama a
    `stampSectionEdits(prev, next, now)` (`src/lib/sectionUtils.ts`, pura: compara por id con la
    versión anterior; una sección nueva sin sello toma su `created`; una restaurada sin ninguno —deshacer
    el borrado de una sección antigua— queda sin sello). Las **notas vinculadas** no lo llevan (su
    metadato vive en `linked-notes.json`; la UI cae a `note.updated`, que es el mtime del fichero).
    Agente IA — `withSectionEdit` en `electron/ai/llm/tools.ts` (`update_section`/`rename_section`, solo
    si el valor cambia); el **deshacer del chat** restaura la sección entera de `before`, con su
    `updated` anterior, y el sello no cuenta como cambio en `noteFingerprint`/`sectionKey` (igual que
    `note.updated`). CLI — `editSection` (`set`, `add`, `section rename`, `history --restore`) y `touch`,
    que estampa con su **mtime** las secciones cuyo `.md` es más reciente que el `note.md` en más de 2 s
    (`sectionsEditedOutside`: editadas a mano tras `noteflow path`; todo escritor de NoteFlow guarda
    ambos a la vez). Una edición externa **sin** `touch` (el watcher del escritorio la recarga) no lo
    estampa.
  - **Plantillas** (`templates.json`) no guardan `updated` (`templatesStore.createTemplate` lo descarta,
    como `created`).
  - **Nunca se rellena** ni se reescriben ficheros por migración. La UI cae con
    `sectionEditedDate(section, note)` (`src/lib/dateUtils.ts` = `firstValidDate(section.updated,
    note.updated)`; un valor no parseable cae a `note.updated`). Hoy solo lo muestra la meta `Section n
    of m · … · edited …` de la vista previa de la vista de contenido (`SectionPreviewPane`).
  - **Sync:** el ancla se compara **sin sus sellos `updated:`** — el de primer nivel y los de sección
    (líneas `    updated:` con 4 espacios; `anchorWithoutUpdated` → `hashForBase`/`planConflictCopy`, con
    espejo en el CLI). Sin esto, editar secciones distintas en dos dispositivos haría que el `note.md`
    cambiara en los dos lados y `mergeAnchors` tomaría los metadatos de sección del remoto (p. ej.
    perdería un renombrado local). Consecuencia aceptada: cuando gana un lado del ancla, los sellos de
    sección son los de ese lado — tras ediciones concurrentes de secciones distintas, el sello de la
    sección editada en el otro lado puede quedar antiguo (solo afecta a la hora mostrada; el contenido
    se fusiona por fichero como siempre). Las bases de anclas que ya llevaban sellos, grabadas por una
    versión anterior (que los hasheaba), cambian de hash una vez al actualizar: como mucho una
    re-subida/fusión del `note.md` sin pérdida.
  - **Móvil (pendiente, 2026-11-18):** su serializador escribe una lista fija de claves, así que al
    reescribir un `note.md` **pierde** los sellos de sección (la UI del escritorio cae a `note.updated`:
    seguro) y sus ediciones no estampan. Además su espejo de `anchorWithoutUpdated` aún no quita los
    sellos de sección: en el móvil, una edición de contenido hecha en el escritorio cuenta como cambio
    de metadatos del ancla (más fusiones "los dos cambiaron", donde gana la metadata remota) hasta que
    se porte.
- **`localOnly: true`** (clave de primer nivel de `note.md`, también en notas cifradas: va fuera del
  bloque `encryption`): la nota no sale nunca de este dispositivo — ningún camino de sync de GitHub, Cloud
  ni el CLI la sube, la journala ni la borra en remoto (detalle en `sync.md` "Notas solo-locales"). Hoy
  solo la lleva la **nota de bienvenida** de la primera ejecución (`electron/welcomeNote.ts`); no hay UI
  para ponerla ni quitarla. Los **tres espejos** la conservan en el round-trip (`parseMetaFields`/
  `serializeNoteFolder` de `noteUtils.ts`, `parseDiskMeta`/`serializeNoteFolder` de `noteFormat.ts`,
  `parseNoteYaml`/`serializeNoteMd` del CLI): si uno la perdiera al guardar, la nota empezaría a
  sincronizarse. *Duplicate* crea una nota normal (construye el borrador campo a campo); exportar la
  conserva (bundle tal cual), así que una nota solo-local importada en otro equipo sigue siendo solo-local.
- **`expiresAt`** (clave de primer nivel, ISO 8601; nota temporal): la escribe solo la app, después de
  `folder` y antes de `localOnly`. Los **tres espejos** la conservan en el round-trip; el CLI no tiene
  comando para ponerla ni quitarla, pero `serializeNoteMd` la reescribe tal cual (entre comillas, como
  `created`). Hasta 2026-11-17 el CLI la **perdía** en cualquier escritura (`add`, `set`, `touch`,
  `rename`, `section …`, `favorite`, `archive`, `move`, `group`/`folder delete`) y la nota temporal pasaba
  a ser permanente; las notas que ya la perdieron no se recuperan. **Regla al añadir una clave a
  `note.md`:** el CLI reescribe el fichero entero desde lo que su lector guardó y **no conserva claves
  desconocidas** (la app tampoco: `serializeNoteFolder` escribe una lista fija), así que toda clave nueva
  hay que añadirla también a `serializeNoteMd`; `tests/cli/frontmatterPreservation.test.ts` escribe una
  nota con todas las claves opcionales usando el serializador de la app, le pasa los comandos de
  escritura del CLI y compara con el parser de la app — añade ahí la clave nueva.
- **`pinned`** (nombre antiguo de `favorited`): los tres espejos lo leen como `favorited ?? pinned` y
  escriben solo `favorited`. El CLI lo perdía al reescribir una nota que aún lo llevara (dejaba de ser
  favorita); corregido a la vez que `expiresAt`.
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
