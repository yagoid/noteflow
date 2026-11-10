---
name: noteflow-cli
description: Guía del CLI de NoteFlow para agentes de IA. Úsala cuando necesites leer, crear, editar u organizar las notas del usuario (secciones, grupos, carpetas) desde la terminal, sincronizarlas con GitHub o NoteFlow Cloud, o integrar NoteFlow en scripts y flujos automatizados.
version: 2.10.1
---

# NoteFlow CLI — guía para agentes

`noteflow` es un script Node.js que lee y escribe directamente en el directorio de notas de la app
de escritorio NoteFlow (los mismos ficheros). Esta guía recoge **lo que el CLI no te avisa por sí
solo**. La sintaxis completa de cada comando está en **`noteflow help <comando>`** (y en
https://yagoid.github.io/noteflow/cli).

**Si un comando falla, lee el error: dice qué hacer.** Nota o sección inexistente (`Did you mean
"…"?` + las existentes), título ambiguo (lista las coincidencias), grupo o carpeta inexistente, flag
desconocido o que ese comando no admite (p. ej. `--dry-run` en `delete`), flags incompatibles o uso
incorrecto salen con exit 1 sin escribir nada. Corrige con lo que te dice y
reintenta. Los datos van a stdout y los avisos y errores a stderr; con `--json`, stdout lleva solo
el JSON.

## Checklist para agentes (en cada tarea)

1. **¿Hay sync?** `noteflow status --json` (cómo leerlo: [Ofrécete a activar el
   sync](#ofrécete-a-activar-el-sync), paso 1).
2. **Con sync, `noteflow pull` al empezar**, también si la tarea solo lee (así respondes con lo
   último) y aunque solo vayas a añadir una línea (evita conflictos con otro dispositivo).
3. **Haz los cambios:** nombres de sección exactos (`noteflow sections "<nota>"`), `read` (no
   `get`) para procesar texto, `path` + editar + `touch` para ediciones parciales, `--create` solo
   para lo que de verdad es nuevo. Escribe solo lo que te pidieron y con el formato que ya tiene la
   nota ([Estilo del contenido](#estilo-del-contenido)). Relee con `read` lo que escribiste.
4. **Mira la línea de sync de cada escritura.** Si todas mostraron `Synced to GitHub` / `Synced
   to NoteFlow Cloud` **y ninguna mostró `Conflict`, `not uploaded` ni `Error:`**, no hace falta
   nada más. Si no (con sync): `noteflow pull`, luego `noteflow push`, y comprueba `Done: … 0 errors` (ver
   [Sincroniza y verifica](#sincroniza-y-verifica)).
5. **Sin sync → haz la tarea igualmente y, en esa misma respuesta, ofrécete UNA vez a activarlo**
   (lo haces tú; el usuario solo autoriza o te da un código). No esperes su respuesta para trabajar:
   si acepta, el `push` tras el login sube lo ya escrito. Si dice que no, no insistas.
6. **Tras un login con éxito, `noteflow push`**: lo escrito antes del login sigue solo en local.
   Excepción: con claves `private (e2ee)`, o `No Cloud keys yet` sin `cloud setup`, el push
   fallaría (ver paso 5 de [Ofrécete a activar el sync](#ofrécete-a-activar-el-sync)).
7. **Informa al usuario** al final de lo que quedó sin sincronizar (solo en local, errores,
   copias de conflicto), con el mensaje literal.

## Modelo mental

- **Nota = título + secciones** (pestañas). Todo se direcciona **por nombre**, nunca por id:
  `noteflow read "<título>" "<sección>"`. En todos los comandos (también `add --title`) el título
  exacto gana y uno parcial vale si solo coincide con una nota; con varias, el comando falla y las
  lista. Los nombres de sección pueden repetirse: elige uno con sufijo 1-based,
  `"Tasks#2"`. Entrecomilla los nombres con espacios.
- **Organización: grupos → carpetas → notas.** Una carpeta vive siempre dentro de un grupo (un solo
  nivel); una nota puede no tener grupo.
- **Nota diaria:** `noteflow add "<texto>"` sin `--title` escribe en la nota de hoy (título
  `DD-MM-YYYY`, sección `Note`), que se crea sola si no existe.
- **Dos modos de sección.** Solo cambian cómo la muestra la app; el `.md` es siempre texto/markdown.
  - **Modo markdown** (por defecto): la app renderiza títulos, listas, `- [ ]`, tablas… Para
    contenido estructurado que el usuario quiere ver formateado.
  - **Modo texto** (`--raw`): se ve tal cual, sin renderizar. Para logs, comandos, salida de
    herramientas o texto que debe verse exacto.
  - El flag **solo cuenta al crear** la sección o la nota; sobre una existente no cambia nada (el
    usuario cambia el modo desde la app).
- **En disco**, cada nota es una carpeta `<slug>-<id>/` con `note.md` (metadatos e índice de
  secciones) y un `.md` por sección. No edites `note.md` a mano: para crear o renombrar secciones,
  `section add` / `section rename`.
- **Notas cifradas:** el CLI las ignora en todos los comandos (no las lista ni las lee).

## Fallos silenciosos (el CLI no avisa, o sale con exit 0)

- **Un fallo de sync sale con exit 0.** El cambio local ya está escrito; solo la salida dice si
  subió. Lee stdout y stderr de cada escritura ([Sincroniza y verifica](#sincroniza-y-verifica)).
- **`set` reemplaza la sección entera; `add` añade al final.** No uses `set` para "añadir".
- **Windows: `noteflow.cmd` trunca en silencio el contenido multilínea** en el primer salto de línea
  (y descarta los flags que vienen detrás). Contenido no trivial (varias líneas, comillas,
  caracteres raros) → **`--file <ruta>`** o **`--stdin`**, en cualquier sistema.
- **Tras editar un `.md` obtenido con `path`, `noteflow touch "<título>"` es obligatorio**: sin él
  el cambio queda solo en local y no se sincroniza.
- **`touch` y cualquier escritura borran los `.md` sueltos** de la carpeta de la nota (todo lo que
  no sea `note.md` ni una sección del índice). No dejes ahí temporales ni copias.
- **`--raw` / `--markdown` sobre una sección existente no hacen nada**, y `section add` crea
  siempre una sección nueva aunque ya exista una con ese nombre (queda duplicada).
- **App de escritorio abierta en v2.1.0 o anterior ⇒ se pierden los grupos y carpetas creados,
  renombrados o borrados desde el CLI**: esas versiones reescriben `groups.json`/`folders.json`
  desde memoria. Las posteriores recargan los cambios del CLI. Los cambios de nota sí sobreviven
  siempre. El CLI avisa por stderr si ve la app abierta: si no sabes su versión, pide al usuario
  que la cierre antes o que haga esos cambios desde la app.
- **`pull --force` pisa notas locales más nuevas.** No lo uses sin que el usuario lo pida, aunque el
  pull diga `skipped (local is newer — use --force to override)`: eso es normal y el `push` las sube.
- **El `pull` de GitHub no aplica borrados:** si avisa `N local notes are not on GitHub (new here,
  or deleted on another device)`, un `push` resucitaría las borradas en otro dispositivo. Haz
  `push` si son notas nuevas (p. ej. las tuyas); si no lo sabes, pregunta al usuario.
- **Borrar sin `--yes`** (`delete`, `section delete`, `group delete`, `folder delete`) en un agente,
  sin terminal, responde "no": `Cancelled`, exit 0, nada borrado. Con sync, `delete` borra la nota
  también del remoto (y de los demás dispositivos).
- **`favorite` y `archive` alternan** (toggle): dos veces deshacen el cambio.
- **`NOTEFLOW_NOTES_DIR=<dir>` solo cambia el directorio de notas, no la sesión de sync**: con sync
  activo, lo que escribas en ese directorio de pruebas se sube a la cuenta real del usuario. Para
  aislarlo, apunta también `APPDATA` (Windows) o `XDG_CONFIG_HOME` (Linux/macOS) a un directorio
  temporal y compruébalo con `noteflow status --json`.

## Chuleta de comandos

Detalle de cada uno: **`noteflow help <comando>`**. `--json` (salida para máquina en stdout) existe
en `list`, `get`, `read`, `path`, `new`, `add`, `set`, `delete`, `groups`, `folders`, `group create`,
`folder create`, `status`, `cloud status` y `login --no-wait`; en los demás es un error.

**Leer**
- `noteflow list [--tag t] [--group g] [--folder f] [--archived] [--json]` — notas (sin las
  archivadas salvo `--archived`); el JSON incluye los nombres de sección.
- `noteflow sections "<nota>"` — secciones y su modo (`text` / `markdown`). Alias: `section list`.
- `noteflow read "<nota>" ["<sección>"] [--section s] [--json]` — contenido **verbatim**, apto para
  pipe y para procesar (sin sección: la nota entera como markdown).
- `noteflow get "<nota>" [--section s] [--json]` — lo mismo, decorado para humanos: no lo uses para
  procesar texto.
- `noteflow path "<nota>" ["<sección>"] [--json]` — ruta absoluta del `.md` de la sección (o de la
  carpeta de la nota).

**Escribir**
- `noteflow add ["<texto>"] [--text t | --file f | --stdin] [--title nota] [--section s]
  [--create] [--tag t] [--group g [--folder f]] [--raw] [--dry-run] [--json]` — **añade al final**.
  `--create` crea lo que falte (la nota de `--title` y/o la sección); con `--create`, usa el título
  exacto (uno parcial que coincide con una sola nota escribe en ella).
- `noteflow set "<nota>" "<sección>" (--text t | --file f | --stdin) [--create] [--raw] [--dry-run]
  [--json]` — **reemplaza** la sección (`--create`: la crea si no existe). La nota debe existir.
- `--dry-run` (en `add`/`set`) valida el destino sin escribir: falla igual que la ejecución real.
- `noteflow new "<título>" [--section s] [--group g [--folder f]] [--raw] [--json]` — nota vacía.
- `noteflow touch "<nota>"` — tras editar un `.md` a mano: relee la nota, bumpea `updated:` y
  sincroniza.
- `noteflow section add "<nota>" "<nombre>" [--raw]` · `section rename "<nota>" "<viejo>"
  "<nuevo>"` · `section delete "<nota>" "<nombre>" --yes` (no borra la última).
- `noteflow rename "<nota>" "<nuevo título>"` · `noteflow delete "<nota>" --yes [--json]` (alias `rm`).
- `noteflow move "<nota>" --group g [--folder f]` · `noteflow move "<nota>" --ungroup`.
- `noteflow favorite "<nota>"` (alias `pin`) · `noteflow archive "<nota>"` — toggles.

**Grupos y carpetas**
- `noteflow groups [--json]` · `group create "<nombre>" [--color c]` · `group delete "<nombre>"
  --yes` (sus notas quedan sin grupo y sus carpetas se borran).
- `noteflow folders [--group g] [--json]` · `folder create "<nombre>" --group g` · `folder rename
  "<nombre>" "<nuevo>" [--group g]` · `folder delete "<nombre>" [--group g] --yes` (sus notas
  vuelven a la raíz del grupo).

**Sync y mantenimiento**
- `noteflow status [--json]` — notas, directorio de notas y estado del sync.
- `noteflow pull` (alias `update`) · `noteflow push` — con el backend activo (NoteFlow Cloud si hay
  sesión, si no GitHub). `--force` solo en `pull` (ver arriba).
- `noteflow login [repo] --no-wait [--json]` → `noteflow login --finish` — GitHub en dos pasos
  (`--no-pull`: conecta sin el pull inicial). `noteflow logout`.
- `noteflow cloud login <email> --send-code` → `noteflow cloud login <email> --code <código>` —
  NoteFlow Cloud en dos pasos (`--no-pull` igual). También `cloud logout`, `cloud status [--json]`,
  `cloud setup`, `cloud push`, `cloud pull`.
- `noteflow migrate` — migración única de notas antiguas (un `.md` plano por nota) al formato de
  carpetas.
- `noteflow self-update` — actualiza el script del CLI y esta skill donde ya esté instalada.
  `noteflow version` — versión instalada.

```bash
noteflow sections "Proyecto Alpha"                                  # nombres exactos
noteflow read "Proyecto Alpha" "Tasks"                              # leer verbatim
noteflow add "- [ ] Revisar logs" --title "Proyecto Alpha" --section "Tasks"
noteflow set "Proyecto Alpha" "Resumen" --file resumen.md --create  # sección nueva
git log --oneline -5 | noteflow add --stdin --section "Log" --create --raw
```

## Editar una sección

- **Reescribirla entera:** `noteflow set "<nota>" "<sección>" --file <ruta>` (o `--stdin`).
- **Edición parcial de una sección grande:** el CLI no tiene buscar/reemplazar. Si tienes
  herramientas de edición de ficheros, edita el `.md` in situ y cierra con `touch`:
  ```bash
  SEC=$(noteflow path "Proyecto Alpha" "Arquitectura")   # ruta absoluta del .md
  # …edita $SEC con tus herramientas…
  noteflow touch "Proyecto Alpha"                         # obligatorio: si no, no sincroniza
  ```
- Sin acceso a esos ficheros (p. ej. la nota está en otra máquina), en una tubería:
  `noteflow read "<nota>" "<sección>" | <transformar> | noteflow set "<nota>" "<sección>" --stdin`.
  Si pasas por un fichero, déjalo **fuera** de la carpeta de la nota y, en PowerShell, guárdalo con
  `Out-File -Encoding utf8` (no con `>`).

## Sincroniza y verifica

Las escrituras (`new`, `add`, `set`, `touch`, `section …`, `rename`, `move`, `favorite`/`pin`,
`archive`, `delete`, `group …`, `folder …`) suben la nota solas al backend activo, pero **el exit
code no dice si subió**. Tras cada una, busca la línea de sync en stdout y stderr:

- `Synced to GitHub` / `Synced to NoteFlow Cloud` → bien. **Si todas tus escrituras la mostraron y
  ninguna mostró `Conflict`, `not uploaded` ni `Error:`, no hace falta nada más** (ni `pull` ni
  `push` al terminar). Ojo: con Cloud una misma escritura puede dar `Conflict: local changes kept
  as …` y después `Synced to NoteFlow Cloud`; eso es un conflicto (ver abajo).
- `Sync failed: …`, `Cloud sync failed: …`, `changed on GitHub since your last pull — not
  uploaded`, `not uploaded: a newer version is on NoteFlow Cloud` o `Conflict: local changes kept
  as "…"` → al terminar, `noteflow pull` y luego `noteflow push`.
- Ninguna línea de sync → comprueba `noteflow status --json`. Si hay sync, al terminar `noteflow
  pull` y luego `noteflow push`. Si no lo hay y aún no lo ofreciste en esta conversación,
  [ofrécete a activarlo](#ofrécete-a-activar-el-sync); si no, avisa al usuario de que el cambio
  quedó solo en local.

Ese `pull` + `push` está bien si acaban en `Done: …` con `0 errors` (cuando lo muestran) y sin
`changed on GitHub`, `not uploaded` ni líneas `Error:`. Aparte, sigue valiendo el `pull` al
empezar (con sync) y el `push` tras activar el sync (salvo e2ee o sin claves).

**Si no se puede sincronizar** (siguen los errores, no hay red, la sesión caducó, conflicto…):
díselo al usuario al final de tu respuesta, de forma explícita: qué notas quedaron solo en local, el
mensaje de error literal y el comando para reintentar (`noteflow pull` / `noteflow push`, o volver a
iniciar sesión). Si hubo conflicto, di el título de la copia de conflicto creada (`<título> (conflict
copy …)`).

**Conflictos al sincronizar** (el `pull` con Cloud; con GitHub, el `push` y la subida automática de
cada escritura, cuando la nota cambió en GitHub desde tu último `pull`): si los dos lados editaron la
misma sección, el CLI la **fusiona línea a línea** dentro de la nota y sube el resultado, sin copia
(p. ej. una línea añadida aquí y otra allí → quedan las dos; con GitHub verás `Synced to GitHub`).
Solo si tocaron **las mismas líneas** guarda las dos versiones entre marcas `> ⚠️ Sync conflict …` /
`> ⚠️ End of sync conflict` e imprime `Merged with conflicts: "<título>" — both versions kept, look
for the ⚠️ markers`: dile al usuario qué nota es (o deja tú la versión buena y borra las marcas si te
lo pidió) y sincroniza. Solo las notas **cifradas** (y pocos casos más) siguen creando una copia de
conflicto. **Nunca** des el trabajo por sincronizado sin ver la confirmación, no reintentes en bucle
y no uses `--force`.

## Ofrécete a activar el sync

El CLI no comparte la sesión de la app de escritorio: necesita su **propio** `login` (GitHub) o
`cloud login` (NoteFlow Cloud) aunque la app ya esté conectada (nunca copies tokens de la app). Con
sesión de Cloud activa, `push`/`pull`/`status` y el sync tras cada escritura usan Cloud y GitHub queda
en pausa. Puedes activarlo tú sin prompts ni comandos bloqueantes: el usuario solo autoriza en GitHub
o te da el código que le llega por email. El usuario también puede hacerlo él mismo desde la app:
**Ajustes → Sync → "Connect the CLI too"** (en GitHub copia allí el token de la app al CLI, sin
autorizar de nuevo); después `status --json` ya sale conectado.

1. **`noteflow status --json`. Casos:**
   - **Ya hay sync → no ofrezcas nada:** `github` con `tokenAccessible: true`, o (con Cloud activo
     el CLI devuelve la forma de `cloud status`) `cloud.enabled: true`.
   - **(a)** `github: null` y `desktopApp` es `null` o no tiene `cloudSignedIn: true` ni `github` →
     el usuario no usa sync.
   - **(b)** `github` con `tokenAccessible: false` (Windows), o `github: null` con
     `desktopApp.github` (macOS/Linux) → la app usa GitHub y el CLI necesita su propio login **al
     mismo repo**: a `noteflow login` pásale **`owner/repo`** (`github.owner`/`github.repo`, o
     `desktopApp.github.owner`/`repo`, p. ej. `ana/noteflow-notes`). Con el owner, si el usuario
     autoriza con otra cuenta de GitHub el login falla sin crear nada; con solo el nombre crearía un
     repo nuevo en esa otra cuenta.
   - **(c)** `desktopApp.cloudSignedIn: true` → la app tiene NoteFlow Cloud (`cloudSyncEnabled`
     dice si sincroniza con él): usa `desktopApp.cloudEmail`. Si se dan (b) y (c), propón el que
     sincroniza en la app: Cloud si `cloudSyncEnabled`, si no GitHub.
2. **Ofrécelo una sola vez por conversación, sin bloquear la tarea:** haz primero lo que te pidió
   y, en esa misma respuesta, pregunta de forma breve y concreta con lo que viste (backend, email,
   repo), no con un genérico "¿GitHub o Cloud?". **Ofrécete a ejecutarlo tú**; no le pases los
   comandos. Ejemplos:
   - (c): *"Tu app usa NoteFlow Cloud con ana@ejemplo.com; ¿activo también el sync aquí? Te llegará
     un código a ese correo y solo tendrás que pasármelo."*
   - (b): *"La app sincroniza con GitHub (ana/noteflow-notes), pero este CLI necesita su propio
     permiso; ¿lo activo? Solo tendrás que autorizar un código en github.com/login/device con la
     cuenta ana."* → luego `noteflow login ana/noteflow-notes --no-wait --json`.
   - (a): *"Tus notas aquí no se sincronizan. ¿Lo activo? Puede ser con GitHub (gratis, repo
     privado `noteflow-notes`) o con NoteFlow Cloud (cifrado, requiere suscripción); tú solo
     autorizas o me das un código."*

   Si dice que no, sigue en local y al final solo avisa de que los cambios quedaron en local.
3. **GitHub:** `noteflow login [repo] --no-wait --json` → `{ verificationUri, userCode, expiresAt,
   repo }`. En (b), `owner/repo` de la app (ver arriba); en (a), sin repo (`noteflow-notes`, que se
   crea privado si no existe) o solo el nombre que el usuario quiera. Pasa al usuario la URL y
   el código (en escritorio el navegador se abre solo) y pídele que te avise al autorizar. Ejecuta
   `noteflow login --finish` **solo cuando lo confirme**: espera hasta que autorice o caduque el
   código. Si el timeout de tu herramienta lo corta, relanza `--finish` (el login pendiente se
   conserva). Debe acabar en `Connected to <usuario>/<repo>` y el pull inicial. Si caducó, vuelve a
   empezar con `--no-wait` solo si el usuario quiere.
4. **NoteFlow Cloud:** confirma el email, `noteflow cloud login <email> --send-code` y, con el código
   que te dé, `noteflow cloud login <email> --code <código>`. Si es inválido o caducó, pídele que lo
   revise y reintenta `--code`; tras 2–3 fallos, un `--send-code` nuevo (con `429 Too many attempts`,
   espera antes de reenviar). Luego mira la línea `Cloud keys:`:
   - `standard (managed)` → el login ya hizo el primer pull.
   - `No Cloud keys yet` → `noteflow cloud setup` **solo si el usuario lo confirma** (crea las
     claves de la cuenta en modo estándar) y después `noteflow pull`.
   - `private (e2ee)` → **no** pidas ni manejes la passphrase: que el usuario ejecute `noteflow
     pull` / `noteflow push` en su terminal o configure `NOTEFLOW_CLOUD_PASSPHRASE`.
5. **Después, `noteflow push`**: el login trae lo remoto pero no sube nada, y lo que escribiste antes
   sigue solo en local. Excepción: con `private (e2ee)`, o `No Cloud keys yet` sin `cloud setup`, el
   push fallaría; díselo al usuario. Luego sigue con [Sincroniza y verifica](#sincroniza-y-verifica).

Nada de bucles: no relances logins sin que el usuario lo pida, y **nunca** uses el flujo
interactivo (`noteflow login` o `noteflow cloud login` sin esos flags): espera stdin o se queda
bloqueado hasta 15 minutos.

## Estilo del contenido

Escribe **solo lo que el usuario pidió**: no rellenes secciones con contenido inventado. Respeta el
formato que ya tiene la nota (p. ej. lista simple frente a checkbox `- [ ]`) y pregunta solo si es
ambiguo de verdad.

Al escribir notas, **no abuses del código inline** (`` `así` ``). Resérvalo para las pocas
referencias que lo piden de verdad y escribe el resto como texto normal: una nota llena de píldoras
monoespaciadas se lee peor y lo importante deja de destacar.

## Instalación y entorno

- Se instala con la app de escritorio (`.exe` en Windows, `.deb` en Linux). Requiere Node.js ≥ 18.
  Linux headless / Raspberry Pi:
  `curl -fsSL https://raw.githubusercontent.com/yagoid/noteflow/main/cli/install-cli.sh | sudo bash`
  (instala también esta skill en `~/.claude/skills` y `~/.agents/skills`; volver a ejecutarlo
  actualiza ambos).
- **`Unknown command`** en un comando de esta guía (p. ej. `touch`, `path` o `cloud`) → el CLI
  instalado es más antiguo: pide al usuario que actualice NoteFlow (refresca el CLI y sus wrappers) o
  ejecuta `noteflow self-update`.
- **PowerShell:** si falla con "running scripts is disabled" (ExecutionPolicy `Restricted`), usa
  `noteflow.cmd` o `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
