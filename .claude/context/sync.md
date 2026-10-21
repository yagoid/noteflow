# NoteFlow — GitHub Sync

### Interfaz `SyncProvider` (`electron/syncProvider.ts`) — fase 4.2, tramo 2

`main.ts` **no llama a `githubSync` en duro** en el flujo de escritura de notas: enruta por
`getActiveSyncProvider()`, que devuelve el backend activo — **NoteFlow Cloud si
`settings.cloudSync.enabled` (prioridad), GitHub en caso contrario**. Son **mutuamente
excluyentes**: esta función es la única fuente de verdad (el tick del autosync de GitHub se salta
si Cloud está habilitado), y la página Settings → Sync lo comunica visualmente (selector de dos
tarjetas con badges de estado + aviso "paused" en el panel de GitHub con Cloud activo — tramo 4,
ver `monetization.md` § 4 "Settings UI").
⚠️ Exclusión mutua = **enrutado**, no "GitHub no escribe nunca": con Cloud activo **`sync:pull` se
rechaza** en `main.ts` (`{…SyncPullResult vacío, error: 'cloud-enabled'}`) y el botón "Sincronizar
ahora" de Settings → Sync → GitHub se oculta: un pull del repo pausado podía resucitar notas borradas
bajo Cloud. Todos los demás pulls de GitHub ya se saltan con Cloud activo (tick del autosync,
arranque, `sync:pull-active`) — **excepto** el pull inicial de `initiateDeviceFlow` al conectar
GitHub (pendiente de decidir). La única forma de refrescar el repo con Cloud activo es **"Espejar en
GitHub"** (`mirrorToGitHub`, abajo), que lo deja exacto.

**Cerrar sesión de la cuenta NoteFlow apaga Cloud** (`enabled = false` vía `disableCloudSync()`,
que conserva `lastSync`/`pullSeq`/journal) → se **libera la exclusión mutua** y GitHub Sync
vuelve a sincronizar solo en su siguiente tick si estaba conectado. Sin ese apagado la app se
quedaba sin ningún backend activo (Cloud sin sesión no puede sincronizar y GitHub seguía "Paused").
Lógica pura de la transición: `electron/accountTransition.ts` (ver `monetization.md` § 4 "Cerrar
sesión").

Superficie (extraída de lo que `main.ts` consumía de `githubSync.ts`; ambos adapters son finos y
delegan 1:1 sin cambiar comportamiento): `isConnected()`, `schedulePush(relPath, content,
onStart?, onComplete?)`, `pushPathsNow(notesDir, relPaths)`, `scheduleDelete(relPath)`,
`scheduleDeleteDir(dir)`, `pullNotes(notesDir)` (mismo shape de resultado en ambos),
`retrySyncJournal(notesDir)`, `hasPendingRemoteMutations()`. Lo específico de cada backend
(Device Flow, migración remota v2, claves E2EE/unlock) queda FUERA de la interfaz — sus IPC
propios llaman a los módulos directamente.

**Botón de sync de la titlebar** (`TitleBar.tsx`): NO está cableado a GitHub. Consume
`sync:get-active-status` (helper `getActiveSyncStatus()` en `syncProvider.ts`, espejo de
`getActiveSyncProvider()`) → status normalizado y etiquetado con `backend` (`'github'|'cloud'|'none'`),
y su pull manual va por `sync:pull-active` (Cloud si `enabled`, GitHub si no). El botón se muestra
cuando CUALQUIER backend está `active` (antes solo con GitHub conectado → un usuario solo-Cloud se
quedaba sin sync manual) y se suscribe a `sync:status-changed`, `cloud:status-changed`,
`notes-updated` y `sync:push-state` (refresca en **cada** cambio de push-state, no solo en `idle`,
para que el contador de pendientes vaya al día). El botón y su **tarjeta de estado al hover** viven
en `SyncStatusButton.tsx` (sin `title` nativo; `aria-label` con resumen); la prioridad del estado
mostrado (syncing → uploading → locked → blocked → error → pending → synced) es lógica pura en
`src/lib/syncStatus.ts` (testeada). Además de lo normalizado, el status lleva `pendingUploads`
(tamaño de `pendingPushFiles` de `main.ts`, que se lo pasa a `getActiveSyncStatus(pendingUploads)`:
ficheros con push **en vuelo** — las ediciones aún dentro del debounce de 5 s no cuentan),
`autoSyncIntervalMs` (`GITHUB_AUTO_SYNC_INTERVAL_MS` en `githubSync.ts` /
`CLOUD_AUTO_SYNC_INTERVAL_MS` en `cloudSync.ts`), en Cloud `cloud.realtimeConnected` (sin
evento propio: se lee al refrescar; la tarjeta re-lee el status al abrirse y cada 30 s) y
`history` (abajo). La acción del clic (sync / reintentar / desbloquear) va en el `aria-label`
del botón; la tarjeta ya no la muestra.
**Aviso de copias de conflicto:** `ActiveSyncStatus.conflictCopies` (`{count, titles, at}`, de nivel
superior — no dentro de `cloud`) lleva el aviso del backend **activo**, sea Cloud
(`CloudSyncStatus.conflictCopies`) o GitHub (`SyncStatus.conflictCopies` de `githubSync.ts`): punto
ámbar en el botón + bloque con los títulos y *Dismiss* en la tarjeta, igual para los dos. *Dismiss*
llama a `sync:dismiss-conflict-copies`, que limpia el aviso de **ambos** backends. El tipo y el lado
disco de la copia son compartidos (`electron/conflictCopy.ts`).
**Historial de actividad (`history`, mini gráfica de barras de la tarjeta):** buffer circular
**solo en memoria** (no se persiste; vacío en cada arranque) de hasta 24 `{at, files, ok}`, uno
**por backend** (`getSyncHistory()` en `githubSync.ts`/`cloudSync.ts`; el status lleva el del
backend activo, así que un pull manual de GitHub con Cloud activo no ensucia la gráfica de Cloud).
Lógica pura en `electron/syncHistory.ts` (testeada); alturas de las barras en `src/lib/syncStatus.ts`.
⚠️ **Cobertura:** con el latido del tick de 5 min (cada pull registra una entrada, aunque mueva 0
ficheros), 24 entradas cubren solo **~las últimas 2 h**. Por eso **"X files today" no suma el
ring**: el mismo registro lleva un **total acumulado del día** (`{day: 'YYYY-MM-DD' local, files}`,
se reinicia al cambiar la fecha local; leído en otro día devuelve 0), expuesto como `filesToday`
en el status (`getSyncFilesToday()`). Es "hoy en esta sesión": tampoco se persiste.
- **Qué cuenta `files`:** subidas = mutaciones remotas que **llegaron de verdad** — GitHub: 1 por
  PUT/DELETE en los wrappers serializados `upsertRemoteFile`/`removeRemoteFile` (un PUT saltado
  por contenido idéntico o un DELETE de algo ya borrado cuentan 0; `upsertRemoteFileNow`/
  `removeRemoteFileNow` devuelven si escribieron); Cloud: 1 por fila en `pushSingleFile`, N filas
  tombstoneadas en `removeRemotePaths`/`deleteRemoteDirNow` (vía `trackActivity`). Bajadas = al
  final de `pullNotes`, ficheros que el pull **cambió en disco** (escritos o borrados, metadatos
  incluidos). Al estar en los primitivos cubre todos los caminos (push debounced, `pushPathsNow`,
  journal retry, catch-up del pull, espejo, borrados).
- **`ok`:** una mutación que lanza registra `ok: false` con 0 ficheros; un pull con `errors` (o
  sin token/claves) también.
- **Sin entradas espurias:** las operaciones que caen en el **mismo minuto de reloj** (bucket fijo
  de `SYNC_HISTORY_BUCKET_MS`, no ventana deslizante) se **funden** en una entrada (ficheros
  sumados, `ok` = AND, `at` = la última). Así un guardado (≥2 PUTs), las ráfagas del push con
  debounce mientras se escribe o un pull + su catch-up dan **una barra por minuto**; un pull sin
  cambios (tick de 5 min) deja un "stub" de 0 ficheros = el latido.
El indicador "pushing" (`sync:push-state`) vale para **ambos** backends: `applyNoteWrite` en
`main.ts` engancha los callbacks `onStart/onComplete` de `schedulePush` del proveedor activo (y el
push durable de las tools del chat) a `pendingPushFiles`. Los deletes no pasan por ese set.
`sync:pull` (GitHub puro) se mantiene intacto para Settings → Sync.

**Cloud Sync** (`electron/cloudSync.ts`, mismo modelo y regla de conflicto que GitHub pero
contra Supabase con E2EE, tombstones en vez de borrado por ausencia, sin cola de mutaciones y
con pull incremental por `seq`, un número de cambio que asigna el servidor — migración 0008; ya no
por `updated_at`, que es la hora de edición y sigue siendo solo la base de los conflictos): detalle
completo en `monetization.md` § 4 (modos de reconciliación y regla de secciones sueltas). Su journal
reutiliza las transiciones puras de `syncState.ts` en un fichero PROPIO
(`userData/cloud-sync-state.json`) — nunca el `sync-state.json` de GitHub.
📌 **Borrados de Cloud (arreglado):** el listado que usa borrar una nota entera pagina por keyset
sobre `seq` (antes un GET capado a 1.000 filas dejaba la nota sin tombstone y el `deleteDir` se daba
por hecho), y el pull **no aplica** el tombstone de una nota con un `upsert` pendiente bajo su
carpeta (`shouldDeletionRuleSkipDir`, el mismo guard que aquí abajo usa la regla de borrado de
GitHub) ni el de una sección con upsert pendiente de ese fichero (`hasPendingUpsert`): gana la
edición local y la nota se re-sube entera con subida **forzada** (resurrección intencionada: el
tombstone es más nuevo por diseño y una subida condicionada se rechazaría) — salvo que **todas** sus
subidas pendientes sean `stale` (el servidor ya rechazó esa versión local) y el `updated` local no
sea posterior al borrado: entonces se borra en local (`planAnchorTombstone`). Detalle en `monetization.md`
§ 4 "Deletes = tombstones".
📌 **Integridad del pull incremental de Cloud:** `pullNotes` avanza el watermark con
`nextPullSeq(s.pullSeq, rows)` (`cloudSyncLogic.ts`) = máxima `seq` de **todas** las filas de la
consulta incremental. Las filas que **fallan al aplicarse** (error de disco en su carpeta o en un json
de metadatos) o **no descifran** no se pierden: entran en el **retry set**
`settings.cloudSync.pullRetry` (path_key → `{relPath?, attempts}`), escrito en el **mismo**
`patchSettings` que avanza `pullSeq`, y cada pull las vuelve a pedir por `path_key` y las mezcla en
su lote (`mergeRetryRows`/`nextPullRetry`, puros). Las indescifrables se abandonan tras 5 intentos y
las que fallan al aplicarse tras 50 (error local permanente); las de ruta insegura nunca se reintentan. Mientras el retry set no esté vacío el estado de Cloud
muestra un error ("Some remote changes could not be applied…") aunque un push posterior limpie
`syncError`, y el espejo a GitHub se bloquea (`hasPendingPullRetries`). Detalle en
`monetization.md` § 4 "Pull incremental".
📌 **Subidas condicionadas de Cloud (migración 0011):** las filas de nota se suben por la RPC
`cloud_upsert_file`, que rechaza ("stale") una versión más vieja que la del servidor; el ciclo de
Cloud hace **pull (y emite su resultado) antes de drenar el journal**. Detalle (stale/force, metadatos, cambio de cuenta)
en `monetization.md` § 4 "Subidas condicionadas".
📌 **Copias de conflicto (los dos backends):** cuando el pull de Cloud va a sobrescribir (ancla remota más
nueva, o una sección remota suelta) o borrar (tombstone `'lost'`) una carpeta con una edición local
**apuntada en el journal** que difiere de la versión del servidor, antes guarda la versión local
como **nota nueva** ("<título> (conflict copy fecha)") y avisa en la tarjeta del botón de sync. Por
eso, con Cloud, las ediciones hechas con la **puerta de push cerrada** se apuntan en el journal (sin
subirse) en lugar de descartarse; en GitHub la puerta sigue sin apuntar nada (allí la detección no
depende del journal: es la comprobación de tres vías contra la caché de shas). Residuales de Cloud
(Cloud desactivado, CLI, formato YAML, alarmas duplicadas…) y detalle en `monetization.md` § 4
"Subidas condicionadas" → "Copias de conflicto". El **GitHub Sync** hace lo mismo desde QA B3 con su
propia regla (subida condicionada de tres vías + "camino de conflicto" del pull): ver "Subida
condicionada (QA B3)" abajo. Mismos helpers (`planConflictCopy`/`buildConflictCopy` de
`cloudSyncLogic.ts`, `writeConflictCopy` de `conflictCopy.ts`), misma etiqueta i18n
(`sync.conflictCopy`, inyectada con `githubSync.setConflictCopyLabel`) y mismo aviso.

**El CLI** (`cli/noteflow.js`) tiene su propio cliente Cloud headless (`noteflow cloud …`, con
sesión y cursor propios en `settings.cliAccount`/`cliCloud`, y la misma prioridad Cloud > GitHub):
ver `monetization.md` § 4 "Cliente CLI (headless)".

**El CLI con GitHub** (`noteflow login/push/pull`) escribe en `settings.githubSync` — en
Windows/Linux es el **mismo `settings.json`** que la app (en macOS el CLI usa `~/.config/noteflow`).
Por eso su `lastSync` obedece al mismo invariante que la regla de borrado del pull de la app
("ausente del remoto + `updated <= lastSync` ⇒ borrada"): `lastSync` solo avanza cuando el repo
tiene **todo** lo que hay en disco (`nextGithubLastSync`/`writeGithubLastSync`). En concreto:
- `login` **no** escribe `lastSync` (re-login al mismo repo conserva el estado previo; otro repo
  empieza limpio) y hace un primer `pull` automático (salvo `--no-pull` o Cloud activo en el CLI).
- **Todo** `pull` de GitHub (`pull`, su alias `update`, `--force` y el de tras el login) lo escribe
  solo si no quedan notas solo-locales (`localOnlyNoteDirs`: sin `note.md` en el remoto, aunque
  tenga secciones); si quedan, conserva el valor previo (o ninguno) y avisa con un texto neutro
  (`… not on GitHub (new here, or deleted on another device) — run 'noteflow push' … if new`): el
  pull del CLI no aplica borrados, así que una nota borrada en otro dispositivo también sale aquí.
- `push` (y `migrate`, que lo llama) lo escribe solo si **ningún** fichero falló al subir — un
  `note.md` fallido es una nota que el repo no tiene; con errores avisa `Last sync not updated`.
- El valor escrito es la hora **de inicio** del comando (`startedAt`, tomada antes de leer el disco,
  como `githubSync.ts`): una nota escrita mientras corre el push/pull queda con `updated > lastSync`.
- El push automático por comando (`syncPushNoteFiles`) **no** toca `lastSync`.
- **Subida condicionada (QA B3, espejo de la app):** `noteflow push` y el push automático de cada
  comando que edita (`syncPushNoteFiles`) hacen la misma comprobación de tres vías por fichero de
  nota (`planConditionalUpsert`), con una caché de bases **propia** del CLI
  (`cli-github-state.json` junto a su `settings.json`, `{owner, repo, shas}`; otra cuenta/repo ⇒
  vacía; `logout` y `login` a otro repo la borran — nunca se comparte con el `sync-state.json` de
  la app). Sin caché (primera ejecución, otro repo) ⇒ comportamiento histórico. Tampoco hace PUTs
  idénticos (antes sí: commits vacíos). Un fichero cuya copia en GitHub cambió desde su base **no se
  sube**: la carpeta se resuelve al final (`githubResolveConflictDir`) — baja la carpeta remota, guarda
  la local como copia de conflicto si difiere (`preserveConflictCopy`, el helper de copias del pull de
  Cloud), escribe la remota encima, sube la copia y avisa `Conflict: local changes kept as "…"`.
  `noteflow pull` registra como base cada blob del tree **solo donde el fichero local ya es ese blob**
  tras el pull (`nextPulledBases`: una carpeta saltada por "local más nuevo" conserva su base vieja,
  para que el siguiente push vea el cambio remoto). Borrados: `noteflow delete` no borra nada en
  GitHub si algún fichero de la nota cambió allí desde su base (`remoteDirChangesSinceBase`; el
  siguiente `pull` la vuelve a bajar), y `noteflow section delete` no borra una sección cambiada en
  GitHub (ni ninguna si el push del ancla acaba de resolver un conflicto). Con `cloudSync.enabled` en
  el `settings.json` (la app usa Cloud) todo es incondicional, como en la app.

⚠️ **Pendiente — CLI con Cloud + app con GitHub sobre el mismo `settings.json`:** un pull de Cloud
del CLI deja en disco notas con su `updated` original (antiguo) que no están en el repo de GitHub.
La app solo desactiva la regla de borrado si `cloudSync.enabled` (`isCloudSyncEnabledFailClosed` en
`electron/githubSync.ts`); no mira `cliCloud`, así que su siguiente pull de GitHub puede borrarlas
("ausente del remoto + `updated <= lastSync`"). Arreglo sugerido (no implementado):
`isCloudSyncEnabledFailClosed` devuelve true también con `cliCloud.enabled === true`, y el CLI marca
`githubSync.needsFullReconcile` en `cloud login` y `cloud logout` (espejo de
`enableCloudSync`/`disableCloudSync`).

### GitHub Sync (`electron/githubSync.ts`)
- **Auth:** Device Flow OAuth — sin client secret; el usuario autoriza en
  `github.com/login/device`. Client ID `Ov23liut9QOJ2pJFF0KR` (público por diseño).
- **Token:** `safeStorage.encryptString()` (cifrado a nivel OS) con fallback a base64, en
  `settings.json`.
- **Modelo de rutas:** el remoto espeja el local — `<dir>/note.md`, `<dir>/<secId>.md`; los json
  de metadatos y README en la raíz. Las rutas relativas se codifican **por segmento**
  (`encodeRemotePath`). Push/delete por archivo siguen usando la **Contents API** (acepta rutas
  con `/`); el **listado** usa la **Git Trees API** (`GET /git/trees/{branch}?recursive=1`,
  `default_branch` cacheado).
- **Push:** `schedulePush(relPath, content, onStart?, onEnd?)` — debounce 5s **keyed por ruta
  relativa** (dos archivos de la misma nota debouncen independientes); llamado desde
  `fs:write-note` (por cada archivo escrito), `groups:set`, `folders:set`, `section-colors:set`,
  `note-order:set`. Los callbacks alimentan `pendingPushFiles` → evento `sync:push-state`.
  Cada push se apunta en el **journal** (abajo) al armar el timer y se da de baja al completar;
  un push fallido setea `syncError` y queda journaled para que `retrySyncJournal` lo reintente
  (antes se perdía hasta que el usuario reeditara). Con GitHub como backend activo cada subida de un
  fichero de nota es **condicionada** (tres vías contra la base cacheada, ver "Subida condicionada
  (QA B3)"): si el fichero cambió en GitHub desde que este dispositivo lo vio, **no** se sube — no es
  un error (sin `syncError`, sin bump de `lastSync`): el op queda `stale` y se pide un pull.
  **Push durable por lotes:** `pushPathsNow(notesDir, relPaths)` sube un set de archivos **ya**
  (awaited, sin debounce, leyendo de disco) y **NO bumpea `lastSync`**. Lo usa `notes:write-imported`:
  cada `schedulePush` que completa adelanta `lastSync` a "ahora", así que durante un import grande un
  pull de auto-sync vería las notas aún no subidas como `updated <= lastSync` y **las borraría**
  (regla de borrado del pull); subirlas al remoto por adelantado las hace inmunes (el pull conserva
  toda carpeta presente en remoto). No-op si el gate de push está cerrado (`initialPullStatus!=='ok'`)
  — ahí `flushPendingLocalChanges` las sube tras el primer pull.
- **⚠️ INVARIANTE — un PUT solo ocurre si el contenido DIFIERE del remoto.** La Contents API
  **commitea un PUT idéntico igualmente** (un commit cuyo tree es el del padre), así que reenviar un
  fichero sin cambios ensucia el historial sin cambiar nada: el repo del usuario llegó a tener un
  **23,8 % de commits vacíos** (ráfagas de 170+ sobre 309 ficheros). Dos guardas, ninguna con
  requests extra:
  1. **`upsertRemoteFileNow`:** el GET que ya hace para obtener el `sha` (token de concurrencia que
     la Contents API exige) devuelve **el git blob sha** del fichero → si coincide con
     `gitBlobSha(content)` **no hay PUT** y la función retorna OK. Los llamantes que cuentan
     `pushed++` y limpian el journal **siguen siendo correctos**: el remoto ya tiene exactamente ese
     contenido, la intención está satisfecha. Defensivo: si la respuesta no trae un `sha` string (un
     directorio responde con un array) no se salta nada. El reintento por conflicto (`_retrying`)
     reentra por la misma función y hereda la guarda.
  2. **Catch-up del pull** (`flushPendingLocalChanges`): ver abajo.
- **Pull:** `pullNotes(notesDir)` — agrupa los blobs del árbol por carpeta de nota; la **carpeta
  es la unidad de conflicto**: compara `updated:` de `note.md` y si el remoto es más nuevo
  escribe la carpeta ENTERA (y borra secciones locales que ya no existan en remoto). Borrado de
  notas a nivel carpeta con la regla de seguridad de siempre (`updated <= lastSync`), y **solo
  si el remoto es v2** (marcador presente y sin planos) — guard de transición. `updatedFiles`
  lleva paths de DIRECTORIOS. **No hay cursor:** cada pull lista el árbol completo
  (`git/trees?recursive=1`), así que el problema del cursor por fecha de Cloud no existe aquí;
  `lastSync` solo alimenta la regla de borrado y el catch-up. **Coste:** el pull NO hace un GET por
  nota — si el blob-sha del `note.md` en el tree coincide con el último reconciliado (sha cache,
  abajo) **y** también los de sus secciones, la carpeta se salta sin ninguna request; solo las
  carpetas con sha nuevo pagan el GET del ancla + comparación de `updated`. Si ese GET falla (`getRemoteFile` se traga el error y devuelve `null`) o el tree viene
  truncado, el pull no añade nada a `errors` pero devuelve `incomplete: true` (no se muestra; solo
  frena la caducidad de notas temporales, ver `patterns.md`).
  **Camino de conflicto (QA B3, antes de la caché):** con GitHub como backend activo, una carpeta
  con un op `stale` o con algún fichero en conflicto de tres vías no pasa por la regla de `updated`
  sino por `resolveRemoteDirConflict` — ver "Subida condicionada (QA B3)".
  **Repo existente VACÍO (sin commits):** la Git Trees API responde **409 "Git Repository is
  empty."**; `fetchRemoteTree` (único listado: pull, espejo, `deleteRemoteDirNow`, migración v2) lo
  trata como listado **vacío y completo** — `isGitHubEmptyRepoError(status, message)` en
  `syncState.ts` (puro y testeado; exige status 409/404 **y** el mensaje de repo vacío, cualquier otro
  error sigue propagándose). El pull inicial termina OK (`initialPullStatus: 'ok'`, sin `syncError`) y
  el catch-up sube las notas locales; antes quedaba `failed` con el error visible hasta un "Sync now"
  manual. Sin riesgo para la regla de borrado: sin marcador v2 el remoto no es v2. `githubRequest`
  rechaza con `GitHubApiError` (mensaje de GitHub + `status` HTTP) para poder distinguirlo.
  **Secciones que llegan después de su ancla (arreglado):** el push sube `note.md` y las secciones
  en commits **separados** (cola serializada, debounce por fichero). Un pull entre medias aplicaba el
  ancla nueva con las secciones viejas y cacheaba el sha del ancla; como la caché solo miraba el ancla
  (y, sin caché, `remoto <= local` también salta), la carpeta se saltaba para siempre y las secciones
  nuevas no se bajaban nunca (reproducido con un GitHub simulado). Ahora la caché guarda también el
  sha de cada **sección** y `planSectionRefresh` (`syncState.ts`, puro y testeado) separa las
  secciones del tree no reconciliadas: si el fichero local ya es ese blob (`gitBlobSha`) se cachea
  sin request (cubre los pushes propios y las cachés de builds anteriores — la primera pasada tras
  actualizar solo lee disco); las demás pasan a "cambiadas". Con secciones cambiadas se hace el GET
  del ancla: **misma versión** (`updated` igual) → se bajan solo esas secciones (regla de secciones
  sueltas de Cloud); **local estrictamente más nuevo** → se respeta y **no** se cachea (cuando aterrice
  el push propio vuelven a ser la misma versión y se bajan las secciones que este dispositivo no
  tocó); timestamps ilegibles → salto histórico, cacheado. Se ignoran las secciones con `upsert` o
  `delete` pendiente en el journal, y las que el **ancla local no lista** (`listAnchorSectionFiles`
  de `cloudSyncLogic.ts`: p. ej. dos dispositivos que migraron la misma nota v1→v2 tienen el mismo
  `updated` pero ids de sección aleatorios distintos — se bajarían como huérfanas).
  ⚠️ **Nunca con GitHub como espejo obsoleto:** con **Cloud habilitado** (leído fail-closed con
  `isCloudSyncEnabledFailClosed()`, como la regla de borrado) o con **`needsFullReconcile`**
  pendiente, no hay refresco de secciones (ni GET del ancla por ellas, ni se cachean las
  "cambiadas"; solo se adoptan las idénticas) — `shouldRefreshSections`, puro en `syncState.ts`. En
  ese estado el repo puede tener "ancla t2 + sección X vieja" mientras Cloud ya trajo X' con el mismo
  t2 (el catch-up subió el ancla pero no la sección); refrescar escribiría X encima de X' y el
  catch-up, que compara con el tree ya leído, descartaría la subida de X': X' perdida. Se decide
  antes del bucle y se re-comprueba justo antes de escribir. Una carpeta con ancla cacheada que ya **no existe en local** se
  sigue saltando (nunca se resucita desde aquí). En el estado estable no hay GETs nuevos.
  ⚠️ Caso límite no cubierto: si el ancla nueva lista una sección que aún no está en el tree, el
  pull intermedio no la crea (sí llega luego por lo anterior); si en ese hueco el usuario edita la
  nota, el editor puede recrearla vacía y subirla (Cloud lo evita bajando las secciones listadas).
  El **journal** (abajo) además guarda al pull de los agujeros de datos: se salta dirs remotos con `deleteDir` pendiente y ficheros con `delete` pendiente (no resucitar borrados que
  aún no aterrizaron), y la regla de borrado local se salta cualquier dir con `upsert` pendiente
  (su push no aterrizó; borrarlo sería pérdida de datos — el upsert se apunta al **armar** el timer,
  así que también cubre la ventana de debounce de 5 s).
- **⚠️ Con Cloud habilitado, GitHub NO borra nada en local (espejo de solo-escritura).** La regla de
  borrado del pull asume que `lastSync` significa "el remoto conocía TODO lo que había en disco en
  ese instante", y esa premisa se rompe en cuanto GitHub queda **pausado por NoteFlow Cloud**: no
  recibe pushes y su `lastSync` deja de describir lo que el repo contiene, así que las notas que
  llegan por Cloud están ausentes del repo **y** con `updated <= lastSync` → la regla las borraba
  (bug de pérdida de datos real: un usuario perdió 42 notas al pulsar Sincronizar en Settings → Sync
  → GitHub). La decisión vive en `shouldRunDeletionRule(lastSyncTime, needsFullReconcile,
  cloudEnabled, remoteIsV2, treeTruncated)` (`syncState.ts`, puro y testeado): solo se borra con
  `lastSync` válido (no nulo ni NaN), remoto v2, **Cloud deshabilitado**, sin reconcile pendiente y
  con el **listado del tree completo** — si GitHub lo trunca (`truncated: true`, repos enormes), una
  carpeta ausente del listado puede seguir existiendo en remoto, así que ese pull no borra nada en
  local (además marca el resultado `incomplete`, ver arriba). `pullNotes` lee
  `cloudEnabled` de `settings.json` **plano y fail-closed** (`isCloudSyncEnabledFailClosed()`: si el
  fichero no se puede leer o parsear responde "Cloud activo" ⇒ no borrar; solo la ausencia de sección
  `cloudSync` — el usuario solo-GitHub — responde false), y lo más tarde posible dentro del pull.
  No usa `readSettings()` porque ese degrada cualquier fallo a `{}` = fail-**open** en un guard
  antipérdida. Importar `cloudSync.ts` sería un ciclo: ahora es él quien importa `githubSync.ts`.
- **`needsFullReconcile` (flag one-shot en `settings.githubSync`, ausente = false):** gobierna el
  **catch-up completo de subida**. Lo pone `markNeedsFullReconcile()` (setter en `githubSync.ts`:
  escribe la variable en memoria **y** `settings.json` a la vez, porque cada push hace
  `settings.githubSync = syncSettings` y machacaría un write externo; no-op sin repo conectado), y lo
  llaman **`enableCloudSync()` Y `disableCloudSync()`** — marcar también a la **salida** es lo que
  protege a) a los usuarios que ya tenían Cloud activo de builds anteriores (nunca recibieron el flag
  al entrar y no hay backfill en el arranque) y b) a las notas que Cloud trajo de otro dispositivo con
  un `updated` viejo, que el flush normal nunca sube. Cerrar sesión pasa por `disableCloudSync()`, así
  que también marca. El **primer pull que termine OK** lo consume y corre `flushPendingLocalChanges`
  con `previousLastSync = undefined`, que re-encola todas las carpetas de nota **cuyo `updated` sea
  parseable** (las que no lo sea se saltan, igual que en el flush normal) — y dentro de cada una,
  solo los ficheros que **difieran** del remoto (filtro por blob sha, abajo: es justo el caso que
  producía las ráfagas de 170+ commits vacíos). Solo se limpia en el camino
  de éxito, nunca en el `catch`. Mientras Cloud siga habilitado, los pulls posteriores corren el flush
  **normal** (desde `previousLastSync`): mantiene el repo razonablemente fresco sin re-subir el corpus
  entero, pero ⚠️ **filtra por el `updated` del `note.md`, no por el momento de llegada**, así que una
  nota que Cloud traiga con `updated` anterior a `previousLastSync` NO se sube — de ahí que el flag se
  vuelva a poner al apagar Cloud, que es cuando el borrado se rehabilita.
  ⚠️ Al tocar cualquier `syncSettings = { ...s, … }` usar como base `syncSettings ?? s` (patrón de
  `persistMigratedAt`): las closures del push debounced viven minutos (debounce + cola de mutaciones
  serializada) y escribir sobre el snapshot viejo borraría un `needsFullReconcile` puesto entretanto,
  re-armando la regla de borrado.
- **Espejo local → repo (`mirrorToGitHub(notesDir)`), acción manual solo-Cloud:** deja el repo como
  **copia exacta** del dir de notas — sube lo que falte o difiera, **borra del remoto** lo que ya no
  exista en local y reafirma el marcador v2. Botón "Mirror to GitHub"/"Espejar en GitHub" en
  Settings → Sync → GitHub, **junto a "Desconectar" y solo si Cloud está
  habilitado** (con diálogo de confirmación: el repo se sobrescribe y se borran ficheros de él).
  Existe porque con Cloud activo GitHub es un espejo de **solo escritura**: no recibe borrados y el
  flush del pull filtra por el `updated` del `note.md`, así que una nota que Cloud trajo de otro
  dispositivo con `updated` viejo nunca sube. "Sincronizar ahora" (`sync:pull`) queda oculto y rechazado con Cloud activo.
  - **Gate de Cloud en `main.ts`** (`sync:mirror-to-github` → `{ok:false, error:'cloud-required'}`
    si Cloud está apagado, y `{ok:false, error:'cloud-initial-pull-pending'}` si el pull inicial de
    Cloud de este dispositivo aún no está en `'ok'` **o** quedan filas en el set de reintento del
    pull (`hasPendingPullRetries()`): en un dispositivo recién activado, o con carpetas que no se
    pudieron aplicar, el disco todavía no es el estado de la cuenta y el espejo borraría del repo
    todo lo no descargado): `githubSync.ts` no puede importar `cloudSync.ts` (ciclo). El handler no
    emite `notes-updated` (el disco no cambia), solo `sync:status-changed`.
  - **Decisión pura y testeada en `electron/mirrorPlan.ts`** (sin imports de Electron, patrón
    `syncState.ts`): `planMirror(localFiles, remoteBlobs, metadataFilenames)` → `{toUpload, toDelete,
    unchanged}`. Los idénticos se saltan **sin ninguna request** comparando el **git blob sha
    calculado en local** (`gitBlobSha` = `sha1("blob <bytes>\0<content>")`) con el sha del tree.
  - ⚠️ **Dos condiciones más para borrar, ambas antipérdida:**
    1. **Solo se toca lo que hay dentro de una carpeta de nota REAL del remoto**, es decir anclada
       por `<dir>/note.md` (misma regla que `groupRemoteNoteDirs`). Una carpeta remota **sin ancla**
       se deja **intacta por completo** (ni `deleteDir` ni `delete` por fichero): no es una nota para
       ninguna parte de la app y el pull ni la mira, así que dejarla no resucita nada, mientras que
       journalar un `deleteDir` sobre ella sería peligroso — si luego se apaga Cloud,
       `retrySyncJournal` la drena con `deleteRemoteDirNow`, que barre **todo** lo que cuelgue de
       `<dir>/` sin allowlist (un `docs/` del usuario perdería `docs/logo.png` y sus subcarpetas).
       *Efecto colateral aceptado:* secciones huérfanas de una carpeta cuyo `note.md` nunca se subió
       no se limpian; el pull las ignora igual.
    2. **Si falló la lectura de CUALQUIER fichero local, la fase de borrado se salta entera.** Con
       la foto local incompleta, "no existe en local" no significa nada: un `note.md` ilegible
       (EACCES, lock de antivirus) parecería una nota borrada y se llevaría su carpeta del repo. El
       resultado lo comunica con un **código** en `warnings` (`'deletions-skipped-unreadable'`) que
       el renderer traduce, separado de `errors` — ahí van los mensajes crudos de la API de GitHub,
       que no son copy nuestro.
       En la misma línea, el espejo empieza con un `readdirSync(notesDir)` explícito: `listNoteDirs`
       traga el fallo y devuelve `[]` (tolerancia intencionada que usan otros sitios), lo que aquí
       sería indistinguible de "el usuario borró todas las notas" — vaciaría el repo **y** el run
       parecería limpio. Un dir **vacío pero legible** sí espeja (vaciar el repo es justo lo que se
       pide, y el diálogo lo avisa).
  - ⚠️ **`toDelete` viene AGRUPADO en entradas de journal (`MirrorDeletion`)**, no como lista plana:
    una carpeta de nota que ya no existe en local se borra como **un solo `deleteDir` con clave
    `<dir>`** (como `scheduleDeleteDir`), y el `delete` por fichero queda solo para secciones sueltas
    de una nota que SÍ sigue en local y para ficheros de raíz. Es una **cuestión de pérdida de
    datos**, no de estética: si el DELETE de `<dir>/note.md` falla y estaba journalado como `delete`
    de fichero, el pull **no lo respeta** — `shouldPullSkipDir` solo mira `deleteDir`, y el ancla se
    reescribe sin pasar por `shouldPullSkipFile` (esa guarda solo cubre las secciones) → la nota
    borrada resucita en disco y Cloud la propaga a todos los dispositivos.
  - ⚠️ **Allowlist de borrado (`isMirrorDeletable`) — lo crítico:** solo se borra (a) `<dir>/*.md`
    dentro de una carpeta de nota, (b) un `METADATA_FILENAMES` de raíz, (c) un `.md` plano de raíz
    (restos de v1). **Nunca** `README.md` (lo escribe NoteFlow y no existe en local), nunca nada con
    un segmento que empiece por `.` (marcador `.noteflow-format`, `.github/`, `.gitignore`), nunca
    otras extensiones de raíz (LICENSE…) ni anidamiento más profundo. La lista de metadatos se
    **pasa como parámetro** para no crear un 5º espejo de `METADATA_FILENAMES`.
  - **Durabilidad:** toda subida/borrado pasa por `upsertRemoteFile`/`removeRemoteFile` (la cola
    serializada) y se journala con las mismas claves que el push/delete normales, **persistiendo
    `sync-state.json` en el acto** al journalar cada borrado (como `scheduleDelete`/
    `scheduleDeleteDir`): si se persistiera solo al final, cerrar la app a media pasada dejaría la
    carpeta a medio borrar en el repo y **sin** entrada en el journal → el siguiente pull manual
    resucitaría la nota desde el `note.md` que quedó. ⚠️ **Pero aquí el
    journal NO significa reintento automático:** el espejo solo corre con Cloud activo, y en ese
    estado **nada drena el journal de GitHub** (el tick del autosync sale antes — `main.ts` — y
    `retrySyncJournal` está gateado por `initialPullStatus === 'ok'`). El journal sirve de red ante
    crash y de **guarda del pull manual** (un `deleteDir` pendiente impide que "Sincronizar ahora"
    resucite la nota); la recuperación real de un fallo es **volver a lanzar el espejo**, y la única
    señal son `syncError` y los `errors` que devuelve la acción. Si más tarde se apaga Cloud, un
    `deleteDir` journalado sí se reintenta vía `deleteRemoteDirNow`, que barre **todos** los blobs
    bajo la carpeta (igual que borrar una nota normalmente).
    Tras cada subida/skip se cachea el sha de los anclas `<dir>/note.md` y de los metadatos, y se
    poda con `pruneShas` a lo que queda en el remoto. Los ficheros que resultan **idénticos** también
    dan de baja su `upsert` journalado (un timer de push cancelado al empezar): dejarlo colgado
    desarmaría para siempre la regla de borrado local de ese dir (`shouldDeletionRuleSkipDir`).
  - **Al terminar SIN errores** bumpea `lastSync` (al instante **previo** a leer el disco, para no
    exponer a la regla de borrado una nota escrita durante el espejo) y **consume
    `needsFullReconcile`**: tras un espejo exacto el repo sí conoce todo lo que hay en disco. Con
    cualquier error no toca ninguno de los dos. Guarda de reentrada `mirrorInFlight` (doble clic) y
    cancelación de los `pushTimers` al empezar (como `pushAllNotes`).
- **Metadata:** `METADATA_FILENAMES` = groups.json, **folders.json**, section-colors.json,
  **note-order.json**, templates.json, ui-settings.json (los dos en negrita se pusheaban pero NO
  se pulleaban — bug arreglado con el cambio de formato). `templates.json` (plantillas) y
  `ui-settings.json` (apariencia + ajustes del editor, ver `architecture.md`) siguen el mismo
  patrón simple que note-order: push debounced + pull. ⚠️ La lista tiene un espejo en
  `CLOUD_METADATA_FILENAMES` (`cloudSyncLogic.ts`), en `RESERVED_ROOT_NAMES` (`main.ts`) y en
  `METADATA_FILES` del CLI (`cli/noteflow.js`) — mantener las cuatro en sync al añadir un JSON raíz.
  📌 **Pendiente (no implementado):** el pull de metadatos **no arbitra por timestamp** — si el
  contenido difiere gana el remoto. Lo único que hoy evita que un repo con metadatos obsoletos pise
  `groups.json`/`folders.json`/`note-order.json` locales es la caché de SHAs; si esa caché se vacía
  (`sync-state.json` perdido o corrupto, `disconnectGitHub`, `pruneShas`), el primer pull tras una
  pausa larga de Cloud sobrescribe los metadatos locales con los viejos. Las notas sobreviven (la
  regla de borrado ya no corre en ese escenario), pero pierden carpeta/grupo/orden.
  👉 Lo que **hoy resuelve** ese escenario es la acción de **espejo** (arriba): sube los metadatos
  locales al repo y re-cachea sus SHAs, así que el siguiente pull ya no tiene nada viejo que pisar.
- **Autosync:** cada 5 min (`AUTO_SYNC_INTERVAL_MS`) mientras esté conectado: primero drena el
  journal (`retrySyncJournal`), luego pull (que se pospone si quedan mutaciones en vuelo).
- **Delete:** `scheduleDelete(relPath)` (sección suelta) y `scheduleDeleteDir(dir)` (lista el
  árbol y borra cada blob bajo `<dir>/` — si el listado viene **truncado** (`truncated: true`, repos
  enormes) `deleteRemoteDirNow` **lanza antes de borrar nada** (`planRemoteDirDelete`, puro): con
  ficheros de la carpeta fuera del listado se borraría a medias y se daría el journal por completado;
  así el `deleteDir` sigue en el journal y la nota queda entera en remoto; usado por borrar nota y
  notas expiradas — estas últimas
  solo justo tras un pull limpio del backend activo, ver `patterns.md` § "Motor de alarmas y notas
  temporales", porque el borrado es incondicional). Ambos se
  journalan antes de ejecutarse y en fallo setean `syncError` y QUEDAN en el journal para retry
  (sin tope de intentos: un borrado remoto perdido = nota que resucita en el siguiente pull). Con
  GitHub activo ambos son **condicionados** (ver "Subida condicionada (QA B3)"): una sección que
  cambió en GitHub no se borra (op `delete` `stale`), y un `deleteDir` sobre una nota cambiada allí no
  borra **nada** — gana la edición remota y la nota vuelve en el siguiente pull.
- **Journal + sha cache (`electron/syncState.ts` + `userData/sync-state.json`):** estado LOCAL de
  durabilidad (deliberadamente fuera del dir de notas — no debe sincronizarse; se limpia en
  `disconnectGitHub()`; corrupto/ausente degrada a estado vacío, nunca bloquea el sync). Dos mapas:
  - **`ops` (journal de mutaciones remotas pendientes):** cada push debounced se apunta como
    `upsert` **al armar el timer** (sobrevive a cerrar la app durante el debounce) — keyed por
    relPath; `scheduleDelete`/`scheduleDeleteDir` como `delete`/`deleteDir` (este último descarta
    los ops de fichero bajo el dir). Baja al completar con éxito; en fallo queda (`attempts++`).
    `retrySyncJournal(notesDir)` lo drena: upserts releen el contenido ACTUAL de disco (si el
    fichero local ya no existe, se descarta la entrada — el borrado lo cubre su propia entrada),
    deletes se re-ejecutan; **no bumpea `lastSync`** (mismo motivo que `pushPathsNow`). Lo llama
    `main.ts` en cada tick del autosync ANTES de `pullNotes` y tras el pull inicial OK; gated por
    `initialPullStatus === 'ok'`. Se **salta los ops `stale`** (subida/borrado ya retenidos por la
    comprobación de tres vías — los resuelve el pull) y los que ya no son el op del snapshot
    (completados o sustituidos mientras drenaba). Un dir con upsert pendiente que **también** cambió en
    GitHub ya no se sobrescribe por LWW y luego se re-sube encima (eso perdía la edición remota, QA B3):
    lo resuelve el camino de conflicto del pull (versión remota + copia de conflicto de la local). Si
    solo cambió el remoto (lo local sigue en su base) el pull lo aplica por **avance rápido**
    (fast-forward, mismo camino, sin copia) **diga lo que diga `updated:`** — antes, con el `updated`
    remoto no más nuevo (reloj desfasado, edición en la web de GitHub que no lo toca), la regla de
    timestamps conservaba lo local, cacheaba el sha remoto como reconciliado y la siguiente edición
    local lo pisaba. La regla de `updated` (LWW por carpeta) sigue rigiendo cuando la base es
    desconocida.
    Flags del op en GitHub: `stale` (upserts **y** deletes de sección) y `conflictCopied` (dedupe de
    copias); `force` es solo de Cloud.
  - **`shas` (cache de blobs reconciliados):** relPath del ancla (`<dir>/note.md`), de cada
    sección (`<dir>/<sec>.md`) o del metadata → blob-sha ya reconciliado por **este** dispositivo. Se
    escribe tras cada decisión del pull (tanto si pulleó como si ganó lo local — salvo secciones con el
    local estrictamente más nuevo, ver "Pull") **y tras cada subida propia** (PUT o salto por idéntico:
    `recordPushedBase`; un DELETE la borra, `forgetRemoteBase`). Permite el skip sin GET y es la
    **BASE** de la subida condicionada (abajo). Se poda a los paths presentes en el tree (más los que
    este dispositivo subió después del listado). El espejo (`mirrorToGitHub`) cachea sin request las
    anclas y metadatos que encuentra idénticos; lo que sube lo cachea la propia subida.
    Los `METADATA_FILENAMES` usan el mismo cache (solo GET cuando el sha del tree difiere).
    La lógica de transiciones/decisiones es pura en `syncState.ts` (sin imports de Electron, patrón
    `entitlements.ts`) y está cubierta por `tests/electron/syncState.test.ts`.
- **⚠️ Serialización de mutaciones remotas (INVARIANTE — leer antes de tocar el sync):** la
  Contents API de GitHub **commitea de una en una por rama** (cada PUT/DELETE mueve el HEAD), así
  que dos escrituras/borrados **concurrentes** chocan con un `409/422` por SHA obsoleto. Por eso
  **TODA** mutación remota pasa por una **única cola** (`enqueueMutation` en `githubSync.ts`):
  `upsertRemoteFile`/`removeRemoteFile` son wrappers finos que encolan su trabajo real (`*Now`) y se
  ejecutan **estrictamente secuencialmente**. **Cualquier write/delete remoto nuevo DEBE ir por
  estos dos puntos** (nunca llamar a `githubRequest` con PUT/DELETE en paralelo ni saltarse la
  cola). Ambos **reintentan una vez** ante conflicto (re-fetch del SHA) y tratan `404` como "ya no
  está" (éxito); **nunca traguen un error de borrado en silencio** — si falla, registrar `syncError`
  Y dejarlo en el **journal** para retry (un borrado remoto perdido hace que la nota **reaparezca**
  en el siguiente pull). Además el
  auto-sync pull **se pospone** si `hasPendingRemoteMutations()` (no rehace una nota cuyo borrado
  remoto aún está en cola). Histórico: un borrado/edición múltiple (p. ej. batch en la group
  overview) disparaba N mutaciones concurrentes → 409s silenciosos → notas restauradas; de ahí la
  cola. Mantener este patrón al añadir operaciones que toquen el remoto (notas, grupos, carpetas,
  metadatos).
- **Subida condicionada (QA B3 — resuelto; antes "las subidas pisan sin condiciones").** El bug:
  `upsertRemoteFileNow` hacía GET del sha actual y PUT con él — ese sha es solo el **token de
  concurrencia** de la Contents API, no "la versión que este dispositivo vio" —, así que A (con X
  sincronizada) editaba X sin haber bajado una edición de X subida por otro dispositivo y su push
  debounced la **pisaba en todas partes**, sin copia ni aviso. Variante: si un pull caía entre la
  edición remota y el push, veía "local estrictamente más nuevo", cacheaba el sha remoto y el push
  pisaba igual. Diseño (lógica pura en `syncState.ts`, testeada en `tests/electron/githubConflict.test.ts`;
  flujo completo contra un GitHub simulado en `tests/electron/githubConditionalSync.test.ts`):
  - **Tres vías por fichero de nota** (`<dir>/<file>.md`): **B** = base = `state.shas[p]` (lo último
    que este dispositivo reconcilió: bajado, adoptado o **subido**; `undefined` = desconocida), **R** =
    sha en GitHub ahora (GET de la Contents API en el push, tree en el pull; `null` = ausente), **L** =
    sha del contenido local. Conflicto = `B definida && R≠B && L≠B && L≠R` (`isThreeWayConflict`).
    **Base desconocida ⇒ comportamiento histórico** (sin copias espurias tras perder la caché, en el
    primer connect o con ficheros de antes de la actualización).
  - **Solo con GitHub como backend activo** (`isConditionalMutation`: no forzado, fichero de nota y
    `!isCloudSyncEnabledFailClosed()`, evaluado al **ejecutar** la mutación). Metadatos, README y
    marcador: incondicionales (como Cloud: los metadatos no tienen versión). Con Cloud activo GitHub es
    el espejo de solo escritura: subidas incondicionales, `mirrorToGitHub` forzado (`force: true`) y el
    pull sin camino de conflicto (`conflictsAllowed = shouldRefreshSections(...)`) — comportamiento
    histórico, sin copias.
  - **Push** (`upsertRemoteFileNow`, dentro de la cola serializada): (1) **comprobación de disco**: si
    el fichero en disco ya no es el contenido capturado (o no existe) → `'superseded'`: sin PUT, sin
    tocar el journal, sin error (una edición posterior arma su propio timer; un pull que resolvió la
    carpeta escribió la versión remota). Verificado: todos los llamantes de `schedulePush`
    (`applyNoteWrite`, metadatos de `main.ts`, catch-up, copias de conflicto) escriben el fichero
    **antes** de programar. (2) `R === L` → `'identical'` (sin PUT, guarda de siempre). (3)
    `planConditionalUpsert(B, R, L)`: `R` nulo → PUT (crear; también con base conocida: una edición
    local gana a un borrado remoto); base desconocida o `R === B` → PUT; si no → **`RemoteChangedError`**
    (sin PUT). (4) Tras cada PUT o salto idéntico se cachea la base (`recordPushedBase`). El reintento
    por 409/422 re-entra y re-evalúa.
  - **Al retenerse** (`holdBackForRemoteChange`): el op se marca `stale` (`journalMarkStale(…, op)`; se
    re-crea si faltaba, con `journalRecordIfAbsent`), **sin** `syncError` ni bump de `lastSync`, y se
    avisa a `main.ts` (`onRemoteConflict`) que lanza un **pull de GitHub en ~3 s** (debounced; solo con
    GitHub activo y el pull inicial OK; se re-arma mientras haya mutaciones en vuelo — la misma espera
    del tick). El tick de 5 min (drain → pull) también lo resuelve. Lo manejan el push debounced, el
    drain, `pushPathsNow`, `pushAllNotes` (no cuenta como error) y `scheduleDelete`. El drain **se salta**
    los ops `stale`. Una nueva edición local re-registra el op y le quita el `stale`.
  - **Borrados**: sección (`removeRemoteFileNow`) con `planConditionalDelete` → `stale` en el op
    `delete`; `deleteDir` (`deleteRemoteDirNow`) lanza **antes de borrar nada** si algún blob de la
    carpeta tiene base y su sha del tree es otro (`remoteDirChangesSinceBase`) → `handleDeleteDirConflict`
    completa el `deleteDir` y **borra las bases de la carpeta**, así que el siguiente pull (pedido al
    momento) la vuelve a bajar entera: **la edición remota gana al borrado local** (solo log, sin aviso
    en la UI). Los blobs se borran luego forzados (la comprobación ya se hizo por carpeta). Los borrados
    del espejo siguen forzados.
  - **Pull — camino de conflicto** (por carpeta remota, tras `shouldPullSkipDir` y **antes** del skip
    por caché; solo si la carpeta existe en local): se evalúa solo cuando algún blob listado difiere de
    su base (o una base cacheada desapareció del tree) o hay un op `stale` bajo la carpeta — cero
    lecturas de disco en el estado estable. Se toman todos los ficheros (tree ∪ bases ∪ disco) con sus
    tres shas (`dirThreeWayShas`); los que en local ya **son** el blob listado se **adoptan** como base
    sin request (cubre pushes propios de builds anteriores); `planGithubDirConflict` decide:
    **conflicto** = op `stale` **o** algún conflicto de tres vías (no necesita journal: cubre ediciones
    del CLI con la app cerrada y el caso "local estrictamente más nuevo"); **fast-forward** (sin
    conflicto) = algún fichero con base conocida cambió en remoto y **todo** fichero local sigue en su
    base, ya es igual al remoto o no existe y no tiene base (sección añadida en remoto) — la carpeta
    remota se aplica por el mismo camino, sin copia, **ignorando `updated:`**. Ninguno de los dos →
    rama histórica, donde además, con GitHub activo, un blob remoto que **no** se aplicó nunca se cachea
    sobre una base conocida si el local no es ese blob (`cacheKeptLocal`): la siguiente edición local
    se retiene en vez de pisar el cambio remoto. `resolveRemoteDirConflict`: (0) si hay mutaciones propias
    en vuelo → aplaza (`incomplete`); (1) GET del ancla y de cada sección remota (un fallo → aplaza, sin
    tocar nada); (2) **todo síncrono desde aquí** (ningún guardado, timer ni mutación puede colarse):
    re-comprueba (mutaciones, pushes propios desde el listado, Cloud activado a mitad → aplaza), relee
    la carpeta local y **re-planifica** (si ya no es conflicto ni fast-forward → aplaza, sin escribir);
    candidatos a copia = ficheros locales cambiados desde su base (o sin base), ninguno solo si **todos**
    los upserts pendientes de la carpeta ya están `conflictCopied` (dedupe por op: un upsert pendiente
    sin el flag — una edición hecha después de una copia cuyo aplicado falló a medias — vuelve a
    provocar copia; una copia de más es aceptable, perder esa edición no); `planConflictCopy` contra el contenido
    remoto (ancla sin `updated:`); si hace falta, `writeConflictCopy` (si falla, lanza → catch por
    carpeta, la carpeta no se toca), `journalMarkDirConflictCopied`, la copia se sube por
    `schedulePushUnguarded` y se acumula el aviso; (3) escribe la carpeta remota entera (ancla primero),
    borra las secciones locales que el remoto no tiene y cachea los shas remotos (del GET, no del tree)
    como base; (4) cancela los timers bajo la carpeta y completa **todos** sus ops
    (`journalCompleteDir`). El caso "remoto más nuevo con lo local en su base" con base conocida va
    ahora por el fast-forward; sin base sigue por la rama wholesale de siempre. Un op `stale` de una carpeta que ya **no existe** en el remoto (listado
    completo) pierde el flag (`journalClearStale`): el drain la re-sube (la edición local gana al
    borrado remoto) en vez de quedar atascado para siempre.
  - **Pushes propios durante un pull:** el pull lista el tree una vez y trabaja un rato; un PUT propio
    que aterriza entretanto cachea su base mientras el listado aún muestra el blob anterior. Si el pull
    comparase con él (o lo cachease) el siguiente push vería "remoto ≠ base" → conflicto espurio. Cada
    mutación propia sube un contador por ruta y por carpeta (`noteOwnRemoteMutation`); el pull (y
    `deleteRemoteDirNow`) captura el contador antes del listado y **no evalúa conflictos ni cachea**
    nada mutado después (`cachePulled`, `dirMutatedSince`). Cubierto por un test que falla sin la guarda.
    Los mapas se podan al soltar cada listado (`beginListing`/`endListing`): las entradas con número
    ≤ el del listado vivo más antiguo ya no pueden responder "mutado después".
  - **Aviso**: el mismo que Cloud (ver "Botón de sync de la titlebar"); `SyncStatus.conflictCopies`,
    solo en memoria, acumulado hasta *Dismiss*, se limpia en `disconnectGitHub()`.
  - **Residuales (asumidos):** base desconocida (caché perdida, `disconnectGitHub`, ficheros nunca
    reconciliados) ⇒ LWW histórico; las ediciones **no** apuntadas en el journal (CLI con la app
    cerrada) **sí** quedan cubiertas por las tres vías del pull; una edición en la app justo después
    de un push del CLI de la misma nota (antes de un pull de la app) da una copia espuria pero segura
    (cachés de base separadas); ventana de actualización: un push de un build anterior no cacheado +
    una edición pendiente nueva ⇒ posible copia espuria en el primer pull; una sección borrada en remoto
    mientras se edita en local puede re-crearse como fichero huérfano (oculto); `settings.json`
    ilegible ⇒ `isCloudSyncEnabledFailClosed` = true ⇒ subidas incondicionales; si el aplicado del
    camino de conflicto falla a medias sin ops en el journal (edición del CLI), el reintento puede hacer
    una segunda copia (el dedupe va por `conflictCopied` de los ops, y una edición posterior sin el flag
    también provoca otra copia — solapada, pero sin perder nada); el ancla y las secciones se suben
    en commits separados, así que si el ancla pasa la comprobación y una sección no, el remoto queda con
    el ancla local + la sección remota (nada se pierde: la copia lleva la versión local completa); el
    camino de conflicto no mira `updated:`: la versión remota gana la carpeta y la local va a la copia.
- **Repo:** se crea automáticamente con `private: true` + `auto_init: true` si no existe.
- **initialPullStatus** (`pending|ok|failed`) gatea pushes hasta que el primer pull tenga éxito.
- **Catch-up de subida (`flushPendingLocalChanges`) — dos niveles de filtro:**
  1. **Puerta por carpeta:** se salta la nota cuyo `note.md updated <= lastSync` (o cuyo `updated` no
     sea parseable). Es lo único que distingue "hay algo que subir": el timestamp **no dice qué
     sección cambió**, así que selecciona la carpeta ENTERA.
  2. **Filtro por fichero (blob sha):** dentro de la carpeta se salta cada `.md` cuyo
     `gitBlobSha(contenido en disco)` coincida con el sha del **tree que el pull ya trajo** — se le
     pasa el `treeShaByPath` de `pullNotes` (`remoteHasContent` en `mirrorPlan.ts`, puro y testeado),
     así que **cero requests extra**. Sin él, editar el título de una nota de 8 secciones encolaba 9
     pushes de los que 8 eran no-ops (y, antes de la guarda de `upsertRemoteFileNow`, 8 commits
     vacíos). ⚠️ **Nunca se salta por falta de datos**: sin mapa de shas, con el path ausente del
     tree o si falla la lectura ⇒ se encola (saltar sería perder un push).
     Al saltar un fichero se **da de baja su `upsert` journalado** (mismo razonamiento que la pasada
     `unchanged` de `mirrorToGitHub`): la intención está satisfecha y dejarla colgada desarmaría para
     siempre la regla de borrado local de ese dir (`shouldDeletionRuleSkipDir`). La función devuelve
     si el journal cambió y `pullNotes` lo persiste con el resto del estado.

  Con esto un guardado real sigue costando **2 commits** (`note.md` + la sección tocada): el push por
  la Git Data API (blobs→tree→commit, 1 commit por guardado) está **descartado por ahora**.
- **Migración remota:** `migrateRemoteToV2IfNeeded(notesDir)` — ver "Migración v1 → v2".

### Lado renderer: un pull con la nota abierta

Un pull (GitHub o Cloud) escribe el disco y emite `notes-updated` → `loadNotes()`/`syncNote()` en
cada ventana. Dos invariantes del renderer (detalle en `patterns.md`, "Sync entre ventanas" y "Sync
de contenido externo en los editores"):

- **El store nunca retrocede por una recarga:** `loadNotes` conserva la copia en memoria de toda nota
  escrita localmente mientras leía/descifraba y luego le hace `syncNote`
  (`keepNotesChangedDuringLoad`, `src/lib/reloadGuard.ts`) — igual que `syncNote` con su snapshot.
- **Un editor enfocado aplica o fusiona el contenido remoto** (outbox de ecos + `merge3`,
  `src/lib/externalContentSync.ts`): antes lo saltaba y la siguiente pulsación subía el texto viejo
  encima del remoto a todos los dispositivos (bug B1).
