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
    isRawMode: true   # true = markdown/raw, false/ausente = rich text (TipTap HTML)
    aiHidden: true    # opcional — la IA NUNCA ve esta sección (índice, chat RAG, tools)
  - id: sec002
    name: Tasks
    file: sec002.md
    created: "2026-01-05T10:00:00.000Z"   # opcional — creación de ESTA sección (ver abajo)
archived: true    # solo presente si true
favorited: true   # solo presente si true
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
- Título por defecto: `DD/MM/YYYY`. Sección por defecto: `Note` en raw.
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
  válido no se muestra la fecha) — línea `Created …` bajo el título del editor y tarjetas
  `SectionPreviewCard`.
- Tags se extraen del contenido con `#nombre` (`extractTags`).
- `NOTEFLOW_NOTES_DIR` (env) redirige el dir de notas en app y CLI (testing/scripting).
- Los parsers toleran BOM UTF-8 (editores externos como Notepad lo añaden).

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
  **solo aditivo** (borrados deshabilitados) para no perder carpetas recién migradas.
- **Orden de despliegue:** actualizar TODOS los clientes (desktop, CLI, móvil) antes de migrar;
  un cliente v1 que escriba después re-crearía archivos planos (la migración los re-absorbe en
  el siguiente arranque, pero mejor evitarlo).
- Smoke test: `node scripts/format-migration-smoke.cjs` (migración + round-trip, sin Electron).

### Cifrado de notas (`src/lib/cryptoUtils.ts`)
AES-256-GCM + PBKDF2 (310.000 iteraciones por defecto, SHA-256) vía WebCrypto. La nota cifrada
guarda solo el bloque `encryption`; sin contraseña no hay secciones legibles. Sin master key ni
backdoor.
