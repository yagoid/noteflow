---
name: noteflow-cli
description: Referencia completa del CLI de NoteFlow. Úsala cuando necesites interactuar con las notas del usuario desde la terminal — crear, leer, editar, organizar notas en grupos y carpetas, sincronizar con GitHub o NoteFlow Cloud, o integrar NoteFlow en scripts y flujos automatizados.
version: 1.12.0
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

> **Windows — shims:** en PATH van dos wrappers: `noteflow.cmd` (cmd.exe) y
> `noteflow.ps1` (PowerShell lo prefiere sobre el `.cmd`). El `.ps1` pasa
> argumentos multilínea y Unicode intactos (el `.cmd` no — ver la nota en `set`)
> y además, dentro de una tubería, **reenvía stdin al CLI como bytes UTF-8** y
> fija `OutputEncoding` a UTF-8 mientras dura la llamada (si no, PS 5.1 decodifica
> la salida con la codepage OEM: `Consideración` → `Consideraci├│n`). Es decir,
> `"texto" | noteflow set … --stdin` y `$x = noteflow read …` funcionan con
> acentos desde PowerShell.
> Si la ExecutionPolicy de PowerShell es `Restricted`, el `.ps1` falla con
> "running scripts is disabled": ejecuta `noteflow.cmd` explícitamente o ajusta
> la política (`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`).
>
> Detalles del `.ps1` en tubería: la salida se reemite desde PowerShell, así que
> se puede capturar (`$x = "t" | noteflow … --json`) y redirigir (`> out.json`);
> **stderr** de esa rama va directo a la consola y **no** se captura con `2>&1`.
> Si un `--stdin` por tubería llega vacío, el shim instalado es anterior a este
> arreglo (`self-update` solo actualiza `noteflow.js`, no los shims): usa
> `--file`, canaliza a `noteflow.cmd`, o actualiza NoteFlow.

### Requisito
Node.js ≥ 18. Sin dependencias npm.

---

## Directorio de notas

| Plataforma | Ruta |
|---|---|
| Linux | `~/.local/share/noteflow-notes/` |
| Windows / macOS | `~/noteflow-notes/` |

---

## Formato de nota (v2 — carpeta por nota)

Cada nota es un **directorio** `<slug>-<id>/` con un `note.md` (solo frontmatter:
metadatos + índice de secciones) y **un `.md` por sección** (markdown puro):

```
proyecto-alpha-abc12345/
  note.md       ← ancla de metadatos
  sec001.md     ← cuerpo de la sección "Note"
  sec002.md     ← cuerpo de la sección "Tasks"
```

`note.md`:

```
---
id: "abc12345"
title: "31-03-2026"
tags: ["urgent", "backend"]
created: "2026-03-31T10:00:00.000Z"
updated: "2026-03-31T10:05:00.000Z"
formatVersion: 2
sections:
  - id: "sec001"
    name: "Note"
    file: "sec001.md"
    isRawMode: true
  - id: "sec002"
    name: "Tasks"
    file: "sec002.md"
    isRawMode: true
---
```

- El contenido de cada sección vive en su archivo `<sectionId>.md` (sin frontmatter).
- `updated:` de `note.md` es el timestamp canónico de sincronización de toda la nota.
- `isRawMode: true` = modo markdown/raw. `false` = modo rich text (TipTap HTML).
- Notas con `encryption:` en `note.md` están cifradas (la carpeta solo contiene
  `note.md`) — el CLI las ignora.
- El marcador `.noteflow-format` (contenido `2`) en la raíz indica el formato v2.
- La variable de entorno `NOTEFLOW_NOTES_DIR` permite apuntar a otro directorio
  (scripting / testing).

---

## Comandos

### `add` — Añadir texto a una nota

```bash
noteflow add [<texto>] [fuente de contenido] [opciones]
```

Añade texto a la nota diaria de hoy (título `DD-MM-YYYY`; se auto-crea si no
existe), o a la nota indicada con `--title`. **Con `--title`, la nota debe
existir**: si no hay match el comando **falla con exit 1** salvo que pases
`--create` (evita crear notas fantasma por un typo en el título).

**Fuente del contenido** — elige UNA (posicional o flag, no ambas a la vez):

| Fuente | Descripción |
|---|---|
| `<texto>` posicional | Texto inline como argumento |
| `--text "<contenido>"` | Texto inline como flag |
| `--file <ruta>` | Lee el contenido de un archivo |
| `--stdin` | Lee de stdin (también se usa automáticamente al recibir un pipe) |

| Opción | Descripción |
|---|---|
| `--title <título>` | Escribir en una nota con ese título en lugar de la del día |
| `--create` | Con `--title`: crea la nota si no existe (sin él → error) |
| `--section <nombre>` | Sección/pestaña destino. La crea si no existe. Default: `Note` |
| `--tag <tag>` | Añade este tag a la nota (si no lo tiene ya) |
| `--group <nombre>` | Asigna la nota a un grupo |
| `--folder <nombre>` | Coloca la nota en una carpeta de ese grupo (requiere `--group`) |
| `--raw` | Fuerza modo raw/markdown en la sección (default) |
| `--rich` | La sección nueva se crea en modo rich text |
| `--dry-run` | Resuelve el destino y muestra qué haría **sin escribir ni sincronizar** |
| `--json` | Resultado JSON en stdout (líneas informativas → stderr) |

**Comportamiento de append:** el texto se añade al final del contenido existente de la sección, separado por `\n`.

**`--section` explícito resuelve igual que en `set`:** nombre exacto → subcadena →
sufijo `#n` para duplicados; ante ambigüedad **falla** en vez de adivinar. Así
`--section "Variables"` escribe en la sección existente `Variables Entorno` en
lugar de crear una duplicada. Solo crea sección nueva si no hay ningún match.

**Sin `--section`, el default `Note` se resuelve exacto-o-crear** (nunca por
subcadena): un `noteflow add "texto"` a la nota diaria no puede acabar en una
sección ajena que contenga la palabra (p. ej. `Meeting Notes`) ni fallar por
ambigüedad. Si quieres el matching parcial, pídelo con `--section`.

**JSON de `add`/`set`:** `{ "note": "<título>", "dirname": "…", "section": "…",
"createdNote": bool, "createdSection": bool, "bytesWritten": n }` (con `--dry-run`
añade `"dryRun": true` y `dirname` es `null` si la nota se crearía).

```bash
noteflow add "Fix: CORS en /api/notes"
noteflow add "Revisar logs del servidor" --section "Tasks" --tag urgent
noteflow add "Reunión con cliente" --title "Proyecto Alpha" --section "Meetings"
noteflow add --file notas.md --title "Nota nueva" --create
git log --oneline -5 | noteflow add --stdin --section "Log"
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
| `--folder <nombre>` | Colocar en una carpeta de ese grupo (requiere `--group`) |
| `--json` | Devuelve `{ id, title, dirname }` en JSON |

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
| `--folder <nombre>` | Filtrar por carpeta (desambigua con `--group` si el nombre se repite) |
| `--archived` | Incluir notas archivadas |
| `--json` | Array JSON con metadata completa de cada nota |

Cada elemento del JSON incluye: `id`, `title`, `tags`, `group`, `folder`, `created`, `updated`, `archived`, `favorited`, `sections` (array de nombres), `dirname`.

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

El JSON incluye: `id`, `title`, `tags`, `group`, `folder`, `created`, `updated`, `archived`, `favorited`, `sections[]` (con `id`, `name`, `content`, `isRawMode`), `dirname`.

```bash
noteflow get "Proyecto Alpha"
noteflow get "Proyecto Alpha" --section Tasks
noteflow get "31-03" --json
```

---

### `read` — Leer contenido RAW (para pipes / agentes)

```bash
noteflow read <título> [sección]
```

Imprime el contenido **tal cual** en stdout, **sin indentar ni decorar** — a
diferencia de `get`, es apto para pipe y para que un agente lo consuma directo.
Es la forma recomendada de **leer** una sección concreta.

| Forma | Resultado |
|---|---|
| `noteflow read "Proyecto Alpha"` | Nota entera como markdown limpio (`# título`, `## sección` + cuerpo) |
| `noteflow read "Proyecto Alpha" "Tasks"` | Solo el cuerpo de esa sección (verbatim) |
| `noteflow read "Proyecto Alpha" --section Tasks` | Igual, forma con flag (útil con títulos multi-palabra) |
| `noteflow read "Proyecto Alpha" --json` | JSON con todas las secciones (o solo una si se indica) |

- El título puede ser parcial. Si hay varios matches, error pidiendo precisión.
- **Nombres de sección duplicados:** apunta a uno con un sufijo 1-based, p. ej.
  `"Tasks#2"`. Si hay ambigüedad sin sufijo, el error te dice exactamente qué escribir.
- **Matching tolerante (solo `read` y `path`):** tras probar nombre exacto y
  subcadena, se compara por palabras ignorando mayúsculas, acentos y palabras
  vacías (`de`, `la`, `the`…), así `"Variables de entorno"` encuentra
  `Variables Entorno`. Solo vale si el candidato es **único**; si acierta por esta
  vía lo avisa por **stderr** (`Note: matched section "…"`), nunca por stdout —
  la salida sigue siendo verbatim y apta para pipe. `add`/`set` y
  `section rename`/`delete` **no** lo usan (escribirían o destruirían la sección
  equivocada).

```bash
noteflow read "Proyecto Alpha" Tasks
noteflow read "Proyecto Alpha" "Tasks#2"
noteflow read "Proyecto Alpha" --json | jq '.sections[].name'
```

---

### `set` — Sobrescribir (o crear) una sección

```bash
noteflow set <título> <sección> [fuente de contenido] [--rich] [--dry-run] [--json]
```

**Reemplaza** el contenido de una sección (la crea si no existe). Es el complemento
de `add`, que solo **añade al final**. Es la forma recomendada de **editar** una sección.

| Fuente (gana la primera presente) | Descripción |
|---|---|
| `--text "<contenido>"` | Texto inline |
| `--file <ruta>` | Lee el contenido de un archivo |
| `--stdin` | Lee de stdin (también se usa automáticamente al recibir un pipe) |
| `--rich` | Si crea la sección, la crea en modo rich text (default: raw) |
| `--dry-run` | Resuelve el destino y muestra qué haría **sin escribir ni sincronizar** |
| `--json` | Resultado JSON en stdout (mismo shape que `add`; info → stderr) |

- Si la sección no existe, se crea (mensaje `Created section "X"`).
- Nombres duplicados: usa el sufijo `#n` (`"Tasks#2"`). Ante ambigüedad sin sufijo,
  `set` **falla** en vez de adivinar.

```bash
noteflow set "Proyecto Alpha" Tasks --text "- [ ] deploy"
cat todo.md | noteflow set "Proyecto Alpha" Tasks --stdin
noteflow set "Proyecto Alpha" Notas --file ./notas.txt
```

> **⚠ Windows — contenido multilínea o complejo:** el shim `noteflow.cmd`
> (cmd.exe) **trunca los argumentos multilínea** en el primer salto de línea y
> descarta el resto de la línea de comandos (se pierden hasta los flags que
> vengan después). Desde PowerShell se usa automáticamente el shim
> `noteflow.ps1`, que pasa argv multilínea y Unicode intactos y **sí reenvía la
> tubería a stdin** (en UTF-8). Aun así, la vía más fiable para **varias líneas**
> o caracteres conflictivos es **`--file <ruta>`** (o `--stdin`; el CLI ya limpia
> el BOM que PowerShell añade). Regla práctica para agentes: **contenido no
> trivial → `--file` o `--stdin`.** Si un `--stdin` por tubería llega vacío en
> Windows, el CLI falla con un error que lo explica: el `noteflow.ps1` instalado
> es anterior al arreglo (ver la nota de shims en *Instalación*).

**Editar una parte concreta de una sección grande:** el CLI edita a nivel de
sección (no hay find-replace). Con `set` el patrón es leer → modificar → sobrescribir:

```bash
noteflow read "Proyecto Alpha" Arquitectura > sec.md   # (en PowerShell, esto pasa a CRLF)
# …editas sec.md…
noteflow set "Proyecto Alpha" Arquitectura --file sec.md
```

> Si tienes herramientas de edición propias (un agente con edit/patch), evita el
> round-trip: **`noteflow path` + `touch`** te dejan editar el `.md` de la sección
> directamente en disco (ver abajo).

---

### `path` — Ruta absoluta del `.md` de una sección (o del dir de la nota)

```bash
noteflow path <título> [sección]
```

Imprime **rutas absolutas** en stdout, **verbatim y sin decorar** (igual que `read`).
Sirve para **editar el `.md` de una sección directamente con tus propias
herramientas** en vez de hacer round-trips `read` → `set --file`. Después de editar,
ejecuta **`noteflow touch <título>`** (bumpea `updated:` y sincroniza).

| Forma | Resultado |
|---|---|
| `noteflow path "Proyecto Alpha"` | Ruta absoluta del **directorio** de la nota |
| `noteflow path "Proyecto Alpha" Tasks` | Ruta absoluta del `.md` de esa sección |
| `noteflow path "Proyecto Alpha" --section Tasks` | Igual, forma con flag (útil con títulos multi-palabra) |
| `noteflow path "Proyecto Alpha" --json` | `{ id, title, dir, noteFile, sections: [{ id, name, file, isRawMode }] }` |
| `noteflow path "Proyecto Alpha" Tasks --json` | `{ id, title, dir, section, file, isRawMode }` |

- En `--json`, `file` es siempre la ruta **absoluta** del `.md`.
- Resolución idéntica a `read`: título parcial, sufijo `#n` para nombres de sección
  duplicados, matching tolerante como último recurso (aviso por stderr), error
  pidiendo precisión si hay ambigüedad. Notas cifradas se ignoran.

```bash
noteflow path "Proyecto Alpha" Tasks
# C:\Users\me\noteflow-notes\proyecto-alpha-abc12345\sec002.md

noteflow path "Proyecto Alpha" --json | jq -r '.sections[] | "\(.name) → \(.file)"'
```

---

### `touch` — Bumpear `updated:` y sincronizar tras editar a mano

```bash
noteflow touch <título>
```

Relee la nota **desde disco** y la reescribe: bumpea el `updated:` de `note.md` (el
timestamp canónico de sync de la nota) y empuja `note.md` + todos los `.md` de
sección al backend de sync activo (Cloud si hay sesión, si no GitHub). Es el
**paso obligatorio después** de editar un `.md` con `noteflow path`: sin él, el
cambio queda solo en local y el sync no se entera.

- **La app de escritorio sí detecta las ediciones externas por su cuenta** (vigila
  el dir de notas de forma recursiva y refresca la nota abierta). Lo que aporta
  `touch` es otra cosa: bumpear `updated:` (el timestamp canónico de sync) y
  empujar los ficheros al backend.
- Sin sync configurado no falla: bumpea `updated:` y no imprime línea de sync.
- Como cualquier comando que escribe, reescribe la carpeta de la nota: los `.md`
  que no sean `note.md` ni una sección listada en el índice **se eliminan**. No
  dejes ficheros sueltos dentro de la carpeta de una nota.
- No crea ni renombra secciones: para eso usa `section add` / `section rename`
  (editar `note.md` a mano no es una vía soportada).

```bash
SEC=$(noteflow path "Proyecto Alpha" Tasks)
# …editas $SEC con tus herramientas…
noteflow touch "Proyecto Alpha"
# Updated "Proyecto Alpha"  (updated: 2026-07-16T17:37:48.807Z)
# Synced to NoteFlow Cloud
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

### `section` — Gestionar secciones (por nombre)

```bash
noteflow section list   <título>
noteflow section add    <título> <nombre> [--rich]
noteflow section rename <título> <viejo> <nuevo>
noteflow section delete <título> <nombre> [--yes]
```

Gestiona las secciones de una nota **por nombre**, sin necesidad de ids.

| Subcomando | Descripción |
|---|---|
| `list` | Alias de `noteflow sections <título>` |
| `add` | Crea una sección vacía (raw por defecto; `--rich` para rich text) |
| `rename` | Renombra una sección (la carpeta/archivo no cambia — va por id) |
| `delete` | Borra una sección (confirm salvo `--yes`). **Rechaza borrar la última** |

- Los nombres de sección **no son únicos**: desambigua duplicados con un sufijo
  1-based, p. ej. `"Tasks#2"`. Entrecomilla los nombres con espacios.

```bash
noteflow section add "Proyecto Alpha" "Meeting Notes"
noteflow section rename "Proyecto Alpha" Tasks To-do
noteflow section delete "Proyecto Alpha" Scratch --yes
noteflow section delete "Proyecto Alpha" "Tasks#2"   # la 2ª sección llamada "Tasks"
```

---

### `delete` / `rm` — Eliminar nota

```bash
noteflow delete <título> [--yes] [--json]
```

Pide confirmación salvo con `--yes`. Si hay sync activo, también la elimina del
remoto (Cloud o GitHub). `--json` imprime
`{ "deleted": true|false, "note": "<título>" }` en stdout (info → stderr).

```bash
noteflow delete "Borrador temporal" --yes --json
```

---

### `rename` — Renombrar nota

```bash
noteflow rename <título-actual> <nuevo-título>
```

Actualiza el campo `title` de `note.md`. El nombre de la carpeta no cambia (contiene el id).

```bash
noteflow rename "Reunión" "Reunión con cliente - Q2"
```

---

### `move` — Mover una nota a un grupo/carpeta

```bash
noteflow move <título> --group <grupo> [--folder <carpeta>]
noteflow move <título> --ungroup
```

Mueve una nota entre grupos y carpetas (equivalente al drag-and-drop de la app).

| Forma | Resultado |
|---|---|
| `--group <g>` | Mueve la nota a la raíz del grupo (limpia la carpeta) |
| `--group <g> --folder <f>` | Mueve la nota a esa carpeta (la carpeta debe existir en el grupo) |
| `--ungroup` | Saca la nota del grupo y la carpeta (queda sin agrupar) |

```bash
noteflow move "Sprint 14" --group backend --folder Planning
noteflow move "Sprint 14" --group backend          # a la raíz del grupo
noteflow move "Sprint 14" --ungroup
```

---

### `favorite` — Marcar/desmarcar como favorita

```bash
noteflow favorite <título>
noteflow pin <título>        # alias
```

Toggle: si es favorita la desmarca, si no lo es la marca (campo `favorited`). La app
de escritorio muestra las favoritas en la parte superior de la lista. `pin` es un
alias histórico del mismo comando.

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

Las notas del grupo quedan sin grupo (no se eliminan). **También se borran las
carpetas de ese grupo** (las carpetas solo existen dentro de un grupo).

---

## Carpetas

Las carpetas son **un único nivel de anidación dentro de un grupo**
(grupo → carpeta → nota). Viven en `folders.json` como
`{ id, name, groupId, order }`. Una nota con `folder` **siempre** tiene también
`group`. Los nombres de carpeta pueden repetirse entre grupos distintos.

### `folders` — Listar carpetas

```bash
noteflow folders [--group <grupo>] [--json]
```

Sin `--group` lista todas, agrupadas por grupo. Con `--group` solo las de ese grupo.

### `folder create` — Crear carpeta

```bash
noteflow folder create <nombre> --group <grupo>
```

`--group` es **obligatorio** (una carpeta no existe fuera de un grupo).

```bash
noteflow folder create Planning --group backend
```

### `folder rename` — Renombrar carpeta

```bash
noteflow folder rename <nombre> <nuevo-nombre> [--group <grupo>]
```

Usa `--group` para desambiguar si el nombre se repite en varios grupos.

### `folder delete` — Eliminar carpeta

```bash
noteflow folder delete <nombre> [--group <grupo>] [--yes]
```

Las notas de la carpeta **caen a la raíz del grupo** (conservan el grupo, pierden
la carpeta). No se eliminan.

```bash
noteflow folder delete Planning --group backend --yes
```

### Asignar notas a carpetas

```bash
# Al crear:
noteflow new "Sprint 14" --group backend --folder Planning
noteflow add "texto" --title "Sprint 14" --group backend --folder Planning

# Mover una existente:
noteflow move "Sprint 14" --group backend --folder Planning

# Filtrar / listar:
noteflow list --group backend --folder Planning
```

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

### `migrate` — Migración única al formato v2

```bash
noteflow migrate
```

Convierte las notas planas v1 (`<slug>-<id>.md` en la raíz) al formato carpeta v2
(`<slug>-<id>/note.md` + un `.md` por sección), escribe el marcador
`.noteflow-format` y, si hay sync con token accesible, sube el nuevo layout y
elimina los archivos planos del remoto. Idempotente. La app de escritorio ejecuta
la misma migración local automáticamente al arrancar.

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

### `version` — Versión del CLI

```bash
noteflow version     # o: noteflow --version / -v
# noteflow CLI v2.2.0
```

---

## Sync con NoteFlow Cloud (cuenta, cifrado)

Alternativa al sync de GitHub ligada a la **cuenta NoteFlow** (requiere suscripción Cloud
para subir cambios). Todo viaja **cifrado en el cliente** (AES-256-GCM); el CLI habla
directamente con el backend, pensado para **máquinas headless** (RPi, servidores, cron).

Mientras hay sesión con Cloud habilitado, **Cloud tiene prioridad sobre GitHub**: los
comandos `push`, `pull`, `status` y el sync automático tras cada mutación usan Cloud
(el sync de GitHub queda en pausa aunque siga configurado).

### `cloud login` — Iniciar sesión

```bash
noteflow cloud login [email]
```

Envía un código de 6 dígitos por email y lo pide por prompt (sin `[email]`, también pide el
email). Un Enter vacío o un formato que no es de 6 dígitos (se ignoran espacios y guiones)
**vuelve a preguntar** sin gastar el código; si el servidor lo rechaza (erróneo o caducado)
permite **hasta 3 intentos en total** sin reenviar el email. Es interactivo: sin stdin (pipe
cerrado, agente, cron) falla con exit 1 en vez de quedarse esperando. La sesión del CLI es
**independiente de la de la app de escritorio** (los tokens rotan en cada uso; compartirla
los desconectaría mutuamente). Al iniciar sesión, el sync Cloud del CLI queda habilitado.

### `cloud logout` — Cerrar sesión

```bash
noteflow cloud logout
```

Conserva las notas locales y el cursor de sync (volver a entrar retoma incremental).

### `cloud setup` — Crear las claves de cifrado (modo estándar)

```bash
noteflow cloud setup
```

Solo para el modo **estándar (managed)**: genera la clave y la deposita en el servidor —
nada que recordar. El modo **privado (e2ee)** se configura desde la **app de escritorio**
(muestra el recovery code de un solo uso); el CLI entonces pide la passphrase o el
recovery code en cada ejecución, o lee `NOTEFLOW_CLOUD_PASSPHRASE` para servidores/cron.
La clave **nunca se guarda en disco** en esta máquina.

### `cloud push` / `cloud pull` — Sync completo manual

```bash
noteflow cloud push   # cifra y sube todas las notas + metadatos
noteflow cloud pull   # baja y descifra los cambios remotos (incremental)
```

El primer push ejecuta automáticamente un pull inicial de reconciliación
(`First Cloud reconcile…`) para no pisar remoto más nuevo. En el pull manda el
`updated:` del ancla de cada nota: el remoto más nuevo gana la carpeta entera; los
borrados remotos solo se aplican si la copia local no cambió desde el último sync.

### `cloud status` — Estado de la cuenta y el sync

```bash
noteflow cloud status [--json]
```

Muestra email, modo de claves (`standard (managed)` / `private (e2ee)` / `none`),
habilitado, último sync y cursor. JSON:
`{ notesDir, noteCount, cloud: { email, enabled, keysMode, lastSync, pullCursor } | null, githubConfigured }`.

---

### `status` — Estado actual

```bash
noteflow status [--json]
```

Muestra: número de notas, directorio, grupos, estado de GitHub y última sync.

JSON: `{ notesDir, noteCount, github: { owner, repo, lastSync, tokenAccessible }, groups }`.

> Con NoteFlow Cloud activo, `status` enruta a `cloud status` y su JSON cambia a la
> forma documentada arriba — los scripts que dependan del shape de GitHub deben
> comprobar la clave `cloud`.

---

## Flags globales

| Flag | Aplica a | Descripción |
|---|---|---|
| `--json` | `list`, `get`, `read`, `path`, `new`, `add`, `set`, `delete`, `groups`, `folders`, `status`, `cloud status` | Salida JSON machine-readable en stdout (líneas informativas → stderr) |
| `--yes` | `delete`, `group delete`, `folder delete`, `section delete` | Salta confirmación interactiva (sin `--yes` y sin stdin la respuesta es "N": `Cancelled`, exit 0, nada borrado) |
| `--archived` | `list` | Incluye notas archivadas |
| `--section <nombre>` | `read`, `path`, `get`, `add`, `set` | Apunta a una sección por nombre |
| `--group <nombre>` | `add`, `new`, `move`, `list`, `folders`, `folder *` | Apunta a/filtra por un grupo |
| `--folder <nombre>` | `add`, `new`, `move`, `list` | Apunta a/filtra por una carpeta (requiere grupo) |
| `--ungroup` | `move` | Saca la nota del grupo y la carpeta |
| `--text` / `--file` / `--stdin` | `add`, `set` | Fuente del contenido a escribir |
| `--create` | `add` | Con `--title`: crea la nota si no existe (sin él, `add` falla) |
| `--dry-run` | `add`, `set` | Resuelve el destino sin escribir ni sincronizar |
| `--rich` | `add`, `set`, `section add` | Sección nueva en modo rich text (default: raw) |
| `--force` | `pull` | Solo GitHub: sobrescribe aunque lo local sea más nuevo |

**Parser estricto:** un flag desconocido (`Unknown flag: --foo`) o un flag de
valor sin valor (`Flag --title requires a value`) son **error con exit 1** —
nunca se ignoran en silencio.

**JSON a prueba de codepage:** toda salida `--json` escapa los caracteres
no-ASCII como `\uXXXX`, así el JSON sobrevive intacto a cualquier codepage de
consola (PowerShell 5.1 incluido). La salida de texto plano (`read`, `get`,
`path`) va en UTF-8 crudo; en PowerShell el shim `noteflow.ps1` pone la consola
en UTF-8 durante la llamada para que no se convierta en mojibake.

---

## Integración con IA / scripts

Para integrar el CLI en scripts o agentes de IA, usa `--json` en los comandos de lectura:

```bash
# Obtener todas las notas como JSON
noteflow list --json

# Leer contenido de una nota específica
noteflow get "Proyecto Alpha" --json

# Crear nota y capturar el id/dirname
noteflow new "Auto-note" --json

# Verificar estado del sync antes de operar
noteflow status --json | jq '.github.tokenAccessible'
```

El CLI escribe en stdout y los errores en stderr, con exit code 0 en éxito y 1 en error.

### Flujo típico para un agente

Todo se direcciona **por nombre** (título de nota + nombre de sección). No necesitas
tocar ids nunca.

```bash
# 1. Descubrir notas y nombres de sección
noteflow list --json

# 2. Leer una sección concreta RAW (apto para pipe — usa 'read', no 'get')
noteflow read "título" "Sección"

# 3a. Sobrescribir una sección (la crea si no existe)
noteflow set "título" "Sección" --text "contenido nuevo"
#    …o desde stdin:
echo "contenido" | noteflow set "título" "Sección" --stdin

# 3b. …o añadir al final en vez de sobrescribir
noteflow add "más contenido" --title "título" --section "Sección"
#    ⚠ --title ya NO auto-crea la nota: si no existe, añade --create (o usa 'new')
#    Regla de oro: contenido no trivial (multilínea, comillas…) → --file o --stdin

# 3c. …o editar el .md de la sección con tus propias herramientas (ver abajo)
noteflow path "título" "Sección"     # → ruta absoluta del .md
# …lo editas…
noteflow touch "título"              # bumpea updated: y sincroniza

# 4. Gestionar la estructura de secciones si hace falta
noteflow section rename "título" "Sección" "Nuevo nombre"

# 5. Sincronizar
noteflow push
```

> **`read` vs `get`:** `get` es para humanos (indenta y decora); `read` emite el
> contenido verbatim — úsalo siempre que vayas a procesar el texto.
> **`set` vs `add`:** `set` **reemplaza** la sección; `add` **añade al final**.

**Ediciones parciales de secciones grandes → `path` + `touch`, no `read` + `set`.**
El CLI no tiene find-replace, así que con `read`/`set` toda edición parcial obliga a
sacar la sección entera, modificarla y volver a escribirla completa. Si tu agente ya
tiene herramientas de edición de ficheros (edit/patch), es mejor pedirle a `path` la
ruta del `.md` de la sección, **editarlo in situ** y cerrar con `touch`:

```bash
# Alternativa a read → modificar → set --file, sin mover el contenido entero
SEC=$(noteflow path "título" "Sección")
# …editas $SEC con tus herramientas de edición (find-replace, patch, append…)…
noteflow touch "título"
```

- `touch` es **obligatorio**: es quien bumpea `updated:` en `note.md` y hace el push
  (editar el `.md` a pelo lo ve la app —vigila el dir de notas—, pero no sincroniza
  nada por sí solo).
- Usa `read`/`set` cuando reescribas la sección entera, o cuando no tengas acceso al
  sistema de ficheros (p. ej. la nota vive en otra máquina).

---

## Notas importantes

- El CLI **no puede descifrar** tokens guardados por la app de escritorio con `safeStorage` de Electron. Requiere su propio `login` (GitHub) y su propio `cloud login` (NoteFlow Cloud) — la sesión Cloud además **no debe** compartirse con la app: los refresh tokens rotan en cada uso y compartirla desconectaría a ambos.
- En modo e2ee la passphrase se pide en cada ejecución (o `NOTEFLOW_CLOUD_PASSPHRASE`); ni la passphrase ni la clave de cifrado se guardan nunca en disco.
- Notas encriptadas (`encryption:` en `note.md`) se **ignoran** en todos los comandos de lectura.
- `NOTEFLOW_NOTES_DIR` (variable de entorno) redirige el directorio de notas — útil para scripts y tests.
- **⚠ App de escritorio abierta ⇒ riesgo de perder cambios de grupos/carpetas.**
  La app mantiene `groups.json`/`folders.json` en memoria y los **reescribe** en sus
  propios ciclos (guardado / auto-sync cada 5 min), **pisando** los grupos y carpetas
  creados desde el CLI mientras la app corre (los cambios a nivel de **nota** —
  contenido, secciones, favorito, archivo — sí sobreviven, viven en carpetas por-nota).
  El CLI ahora **avisa** por stderr si detecta `NoteFlow` en ejecución al mutar
  grupos/carpetas. Para cambios fiables de estructura: **cierra la app** primero (o
  hazlos desde la propia app). Silencia el aviso con `NOTEFLOW_NO_APP_CHECK=1`.
- `noteflow help <comando>` muestra ayuda detallada de un comando concreto
  (`help new`, `help favorite`, `help folder`, etc.).
