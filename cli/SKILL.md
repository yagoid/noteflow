---
name: noteflow-cli
description: Referencia completa del CLI de NoteFlow. Úsala cuando necesites interactuar con las notas del usuario desde la terminal — crear, leer, editar, organizar notas y grupos, sincronizar con GitHub, o integrar NoteFlow en scripts y flujos automatizados.
version: 1.5.0
---

# NoteFlow CLI — Referencia completa

NoteFlow CLI es un script Node.js standalone (`cli/noteflow.js`) sin dependencias externas. Escribe/lee directamente en el directorio de notas de NoteFlow, compartiendo los mismos archivos que la app de escritorio.

## Instalación

### Linux/RPi headless
```bash
curl -fsSL https://raw.githubusercontent.com/yagoid/noteflow/main/cli/install-cli.sh | sudo bash
```

### Linux desktop / Windows
Se instala automáticamente con el `.deb` o `.exe` de NoteFlow. No requiere pasos adicionales.

### Requisito
Node.js ≥ 18. Sin dependencias npm.

---

## Directorio de notas

| Plataforma | Ruta |
|---|---|
| Linux | `~/.local/share/noteflow-notes/` |
| Windows / macOS | `~/noteflow-notes/` |

---

## Formato de nota

Cada nota es un archivo `.md` con YAML frontmatter:

```
---
id: "abc12345"
title: "31-03-2026"
tags: ["urgent", "backend"]
created: "2026-03-31T10:00:00.000Z"
updated: "2026-03-31T10:05:00.000Z"
sections:
  - id: "sec001"
    name: "Note"
    content: "texto aquí"
    isRawMode: true
  - id: "sec002"
    name: "Tasks"
    content: "- [ ] tarea pendiente"
    isRawMode: true
---
texto aquí
```

- El cuerpo tras `---` es siempre el contenido de la primera sección (para legibilidad externa).
- `isRawMode: true` = modo markdown/raw. `false` = modo rich text (TipTap HTML).
- Notas con `encryption:` en el frontmatter están cifradas — el CLI las ignora.

---

## Comandos

### `add` — Añadir texto a una nota

```bash
noteflow add <texto> [opciones]
```

Añade texto a la nota diaria de hoy (título `DD-MM-YYYY`). Si no existe, la crea.

| Opción | Descripción |
|---|---|
| `--title <título>` | Escribir en una nota con ese título en lugar de la del día |
| `--section <nombre>` | Sección/pestaña destino. La crea si no existe. Default: `Note` |
| `--tag <tag>` | Añade este tag a la nota (si no lo tiene ya) |
| `--group <nombre>` | Asigna la nota a un grupo (solo al crear) |
| `--rich` | La sección nueva se crea en modo rich text |

**Comportamiento de append:** el texto se añade al final del contenido existente de la sección, separado por `\n`.

```bash
noteflow add "Fix: CORS en /api/notes"
noteflow add "Revisar logs del servidor" --section "Tasks" --tag urgent
noteflow add "Reunión con cliente" --title "Proyecto Alpha" --section "Meetings"
noteflow add "nueva feature" --group backend
```

---

### `new` — Crear nota vacía

```bash
noteflow new <título> [opciones]
```

| Opción | Descripción |
|---|---|
| `--section <nombre>` | Nombre de la primera sección. Default: `Note` |
| `--group <nombre>` | Asignar a un grupo |
| `--json` | Devuelve `{ id, title, filename }` en JSON |

```bash
noteflow new "Proyecto Alpha"
noteflow new "Sprint 14" --group backend --section "Planning"
noteflow new "Mi nota" --json
```

---

### `list` — Listar notas

```bash
noteflow list [opciones]
```

Muestra notas ordenadas por `updated` desc. Por defecto excluye archivadas.

| Opción | Descripción |
|---|---|
| `--tag <tag>` | Filtrar por tag |
| `--group <nombre>` | Filtrar por grupo |
| `--archived` | Incluir notas archivadas |
| `--json` | Array JSON con metadata completa de cada nota |

Cada elemento del JSON incluye: `id`, `title`, `tags`, `group`, `created`, `updated`, `archived`, `pinned`, `sections` (array de nombres), `filename`.

```bash
noteflow list
noteflow list --group backend
noteflow list --tag urgent --json
noteflow list --archived
```

---

### `get` — Ver contenido de una nota

```bash
noteflow get <título> [opciones]
```

El título puede ser parcial — si hay varios matches, muestra la lista y pide más precisión.

| Opción | Descripción |
|---|---|
| `--section <nombre>` | Mostrar solo esta sección |
| `--json` | JSON completo con todas las secciones y su contenido |

El JSON incluye: `id`, `title`, `tags`, `group`, `created`, `updated`, `archived`, `pinned`, `sections[]` (con `id`, `name`, `content`, `isRawMode`), `filename`.

```bash
noteflow get "Proyecto Alpha"
noteflow get "Proyecto Alpha" --section Tasks
noteflow get "31-03" --json
```

---

### `sections` — Ver secciones de una nota

```bash
noteflow sections <título>
```

Lista las secciones con nombre, número de líneas y modo (raw/rich).

```bash
noteflow sections "Proyecto Alpha"
# Secciones de "Proyecto Alpha":
#   Note  (3 lines, raw/markdown)
#   Tasks  (5 lines, raw/markdown)
```

---

### `delete` / `rm` — Eliminar nota

```bash
noteflow delete <título> [--yes]
```

Pide confirmación salvo con `--yes`. Si hay sync activo, también la elimina del repositorio GitHub.

```bash
noteflow delete "Borrador temporal" --yes
```

---

### `rename` — Renombrar nota

```bash
noteflow rename <título-actual> <nuevo-título>
```

Actualiza el campo `title` del frontmatter. El nombre de archivo no cambia (contiene el id).

```bash
noteflow rename "Reunión" "Reunión con cliente - Q2"
```

---

### `pin` — Fijar/desfijar nota

```bash
noteflow pin <título>
```

Toggle: si está pinned la desfija, si no lo está la fija. La app de escritorio muestra las notas pinned en la parte superior de la lista.

---

### `archive` — Archivar/desarchivar nota

```bash
noteflow archive <título>
```

Toggle: alterna el estado `archived`. Las notas archivadas no aparecen en `list` salvo con `--archived`.

---

## Grupos

Los grupos son categorías visuales (con color) que agrupan notas en la sidebar de la app.

### `groups` — Listar grupos

```bash
noteflow groups [--json]
```

### `group create` — Crear grupo

```bash
noteflow group create <nombre> [--color <color>]
```

Colores disponibles: `accent` (default), `accent-2`, `red`, `cyan`, `purple`, `text`, `orange`, `pink`.

```bash
noteflow group create backend --color cyan
noteflow group create "Proyectos cliente" --color orange
```

### `group delete` — Eliminar grupo

```bash
noteflow group delete <nombre> [--yes]
```

Las notas del grupo quedan sin grupo (no se eliminan).

---

## Sync con GitHub

El CLI usa Device Flow OAuth — igual que la app de escritorio, pero guarda el token por separado (sin cifrado de OS). Si el usuario ya está logueado en la app de escritorio, el CLI necesita su propio `login`.

### `login` — Conectar con GitHub

```bash
noteflow login [nombre-repo]
```

Default repo: `noteflow-notes`. Muestra un código y URL para autorizar en el navegador. En headless, el usuario abre la URL desde otro dispositivo.

```bash
noteflow login
noteflow login mis-notas-privadas
```

### `logout` — Desconectar

```bash
noteflow logout
```

### `push` — Subir todas las notas

```bash
noteflow push
```

### `pull` / `update` — Bajar notas del repo

```bash
noteflow pull
noteflow update   # alias
```

Solo sobreescribe si el `updated:` remoto es más reciente que el local.

### `self-update` — Actualizar el CLI

```bash
noteflow self-update
```

Descarga la versión más reciente de `cli/noteflow.js` desde GitHub y reemplaza el script actual. Útil en RPi headless donde no hay instalador. No requiere estar conectado a GitHub sync — usa la API pública del repo.

```bash
noteflow self-update
# Checking for updates...
# Updated successfully → /usr/local/bin/noteflow
```

Si ya está en la última versión: `Already up to date`.

---

### `status` — Estado actual

```bash
noteflow status [--json]
```

Muestra: número de notas, directorio, grupos, estado de GitHub y última sync.

JSON: `{ notesDir, noteCount, github: { owner, repo, lastSync, tokenAccessible }, groups }`.

---

## Flags globales

| Flag | Aplica a | Descripción |
|---|---|---|
| `--json` | `list`, `get`, `new`, `groups`, `status` | Salida JSON machine-readable |
| `--yes` | `delete`, `group delete` | Salta confirmación interactiva |
| `--archived` | `list` | Incluye notas archivadas |

---

## Integración con IA / scripts

Para integrar el CLI en scripts o agentes de IA, usa `--json` en los comandos de lectura:

```bash
# Obtener todas las notas como JSON
noteflow list --json

# Leer contenido de una nota específica
noteflow get "Proyecto Alpha" --json

# Crear nota y capturar el id/filename
noteflow new "Auto-note" --json

# Verificar estado del sync antes de operar
noteflow status --json | jq '.github.tokenAccessible'
```

El CLI escribe en stdout y los errores en stderr, con exit code 0 en éxito y 1 en error.

### Flujo típico para un agente

```bash
# 1. Ver qué notas existen
noteflow list --json

# 2. Leer una nota completa con todas sus secciones
noteflow get "título" --json

# 3. Añadir información a una sección específica
noteflow add "contenido nuevo" --title "título" --section "Sección"

# 4. Sincronizar
noteflow push
```

---

## Notas importantes

- El CLI **no puede descifrar** tokens guardados por la app de escritorio con `safeStorage` de Electron. Requiere su propio `login`.
- Notas encriptadas (`encryption:` en frontmatter) se **ignoran** en todos los comandos de lectura.
- El auto-sync de la app desktop (cada 5 min) puede sobreescribir cambios locales del CLI si ambos corren simultáneamente y el token de la app tiene acceso a GitHub.
- `noteflow help <comando>` muestra ayuda detallada de un comando concreto.
